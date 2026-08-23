// 管理者によるユーザー一覧・パスキー手動復旧（仕様書 §7.1、issue #35）のテスト。
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/types';
import { adminUsersRoute } from '../src/routes/admin-users';
import { issueSession } from '../src/auth/session';
import { createUser } from '../src/db/users';
import { createPasskey, listPasskeysByUserId } from '../src/db/passkeys';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.post('/login-as/:userId', async (c) => {
    await issueSession(c, c.req.param('userId'));
    return c.body(null, 204);
  });
  app.route('/admin/users', adminUsersRoute);
  return app;
}

async function createTestUser(overrides: { isAdmin?: boolean; name?: string } = {}) {
  return createUser(env.DB, {
    id: crypto.randomUUID(),
    name: overrides.name ?? 'Test User',
    email: `user-${crypto.randomUUID()}@example.com`,
    isAdmin: overrides.isAdmin ?? false,
    canTeach: false,
  });
}

async function loginAs(app: Hono<AppEnv>, userId: string): Promise<string> {
  const res = await app.request(`/login-as/${userId}`, { method: 'POST' }, env);
  const cookie = res.headers.get('set-cookie');
  if (!cookie) throw new Error('login failed: no session cookie issued');
  return cookie.split(';')[0]!;
}

async function addPasskey(userId: string, name: string | null) {
  const id = crypto.randomUUID();
  await createPasskey(env.DB, {
    id,
    userId,
    credentialId: `cred-${id}`,
    publicKey: 'dummy',
    counter: 0,
    transports: null,
    name,
  });
  return id;
}

describe('admin user management (issue #35)', () => {
  it('rejects a non-admin from listing users', async () => {
    const app = buildApp();
    const user = await createTestUser();
    const cookie = await loginAs(app, user.id);
    const res = await app.request('/admin/users', { headers: { cookie } }, env);
    expect(res.status).toBe(403);
  });

  it('lets an admin list all users', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true, name: 'Admin' });
    await createTestUser({ name: 'Someone Else' });
    const cookie = await loginAs(app, admin.id);
    const res = await app.request('/admin/users', { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    const { users } = await res.json<{ users: { id: string }[] }>();
    expect(users.length).toBeGreaterThanOrEqual(2);
  });

  it('lets an admin list another user’s passkeys, including the default-named ones', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const target = await createTestUser();
    await addPasskey(target.id, 'Mac Chrome');
    const cookie = await loginAs(app, admin.id);

    const res = await app.request(`/admin/users/${target.id}/passkeys`, { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    const { passkeys } = await res.json<{ passkeys: { name: string | null }[] }>();
    expect(passkeys).toHaveLength(1);
    expect(passkeys[0]!.name).toBe('Mac Chrome');
  });

  it('rejects a non-admin from deleting another user’s passkey', async () => {
    const app = buildApp();
    const user = await createTestUser();
    const target = await createTestUser();
    const passkeyId = await addPasskey(target.id, null);
    const cookie = await loginAs(app, user.id);

    const res = await app.request(`/admin/users/${target.id}/passkeys/${passkeyId}`, {
      method: 'DELETE',
      headers: { cookie },
    }, env);
    expect(res.status).toBe(403);
  });

  it('lets an admin delete a user’s last remaining passkey (unlike self-service deletion)', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const target = await createTestUser();
    const passkeyId = await addPasskey(target.id, null);
    const cookie = await loginAs(app, admin.id);

    const res = await app.request(`/admin/users/${target.id}/passkeys/${passkeyId}`, {
      method: 'DELETE',
      headers: { cookie },
    }, env);
    expect(res.status).toBe(204);
    expect(await listPasskeysByUserId(env.DB, target.id)).toHaveLength(0);
  });

  it('returns 404 for a passkey that does not belong to the given user', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const target = await createTestUser();
    const otherUser = await createTestUser();
    const passkeyId = await addPasskey(otherUser.id, null);
    const cookie = await loginAs(app, admin.id);

    const res = await app.request(`/admin/users/${target.id}/passkeys/${passkeyId}`, {
      method: 'DELETE',
      headers: { cookie },
    }, env);
    expect(res.status).toBe(404);
  });
});
