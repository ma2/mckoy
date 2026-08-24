// 講座に紐付かない招待（管理者・講師付与）の一覧・失効のテスト（issue #42）。
// 招待の作成自体（POST /）はこれまでテストが無かったので合わせて軽くカバーする。
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/types';
import { adminInvitationsRoute } from '../src/routes/admin-invitations';
import { issueSession } from '../src/auth/session';
import { createUser } from '../src/db/users';
import { createInvitation, getInvitationByTokenHash } from '../src/db/invitations';
import { sha256Hex } from '../src/util/crypto';
import { sqliteTimestamp } from '../src/util/time';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.post('/login-as/:userId', async (c) => {
    await issueSession(c, c.req.param('userId'));
    return c.body(null, 204);
  });
  app.route('/admin/invitations', adminInvitationsRoute);
  return app;
}

async function createTestUser(overrides: { isAdmin?: boolean } = {}) {
  return createUser(env.DB, {
    id: crypto.randomUUID(),
    name: 'Test User',
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

function jsonRequest(method: string, cookie: string, body: unknown) {
  return { method, headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

describe('POST /admin/invitations authorization', () => {
  it('rejects a non-admin', async () => {
    const app = buildApp();
    const user = await createTestUser();
    const cookie = await loginAs(app, user.id);
    const res = await app.request(
      '/admin/invitations',
      jsonRequest('POST', cookie, { name: 'N', email: `n-${crypto.randomUUID()}@example.com`, canTeach: true }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/invitations (issue #42)', () => {
  it('rejects a non-admin from listing', async () => {
    const app = buildApp();
    const user = await createTestUser();
    const cookie = await loginAs(app, user.id);
    const res = await app.request('/admin/invitations', { headers: { cookie } }, env);
    expect(res.status).toBe(403);
  });

  it('lets an admin list course-independent invitations, newest first', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const cookie = await loginAs(app, admin.id);

    await app.request(
      '/admin/invitations',
      jsonRequest('POST', cookie, { name: 'First', email: `first-${crypto.randomUUID()}@example.com`, canTeach: true }),
      env,
    );
    await app.request(
      '/admin/invitations',
      jsonRequest('POST', cookie, { name: 'Second', email: `second-${crypto.randomUUID()}@example.com`, isAdmin: true }),
      env,
    );

    const res = await app.request('/admin/invitations', { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    const { invitations } = await res.json<{ invitations: { name: string; revokedAt: string | null }[] }>();
    expect(invitations.map((i) => i.name)).toEqual(['Second', 'First']);
    expect(invitations.every((i) => i.revokedAt === null)).toBe(true);
  });

  it('does not list course-scoped or passkey-reset invitations', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const token = `test-token-${crypto.randomUUID()}`;
    await createInvitation(env.DB, {
      id: crypto.randomUUID(),
      email: `course-${crypto.randomUUID()}@example.com`,
      name: 'Course Invite',
      isAdmin: false,
      canTeach: false,
      courseId: crypto.randomUUID(),
      membershipRole: 'student',
      targetUserId: null,
      tokenHash: await sha256Hex(token),
      expiresAt: sqliteTimestamp(60_000),
      invitedBy: null,
    });

    const cookie = await loginAs(app, admin.id);
    const res = await app.request('/admin/invitations', { headers: { cookie } }, env);
    const { invitations } = await res.json<{ invitations: unknown[] }>();
    expect(invitations).toHaveLength(0);
  });
});

describe('DELETE /admin/invitations/:id (issue #42)', () => {
  it('rejects a non-admin', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const cookie = await loginAs(app, admin.id);
    await app.request(
      '/admin/invitations',
      jsonRequest('POST', cookie, { name: 'N', email: `n-${crypto.randomUUID()}@example.com`, canTeach: true }),
      env,
    );
    const listRes = await app.request('/admin/invitations', { headers: { cookie } }, env);
    const { invitations } = await listRes.json<{ invitations: { id: string }[] }>();
    const invitationId = invitations[0]!.id;

    const user = await createTestUser();
    const userCookie = await loginAs(app, user.id);
    const res = await app.request(`/admin/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: { cookie: userCookie },
    }, env);
    expect(res.status).toBe(403);
  });

  it('lets an admin revoke a course-independent invitation, making it unusable', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const cookie = await loginAs(app, admin.id);
    const createRes = await app.request(
      '/admin/invitations',
      jsonRequest('POST', cookie, { name: 'N', email: `n-${crypto.randomUUID()}@example.com`, canTeach: true }),
      env,
    );
    const { invitationUrl } = await createRes.json<{ invitationUrl: string }>();
    const token = invitationUrl.split('/invitations/')[1]!;
    const listRes = await app.request('/admin/invitations', { headers: { cookie } }, env);
    const { invitations } = await listRes.json<{ invitations: { id: string }[] }>();
    const invitationId = invitations[0]!.id;

    const revokeRes = await app.request(`/admin/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: { cookie },
    }, env);
    expect(revokeRes.status).toBe(204);

    const invitation = await getInvitationByTokenHash(env.DB, await sha256Hex(token));
    expect(invitation!.revoked_at).not.toBeNull();
  });

  it('returns 404 for a nonexistent invitation id', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const cookie = await loginAs(app, admin.id);
    const res = await app.request(`/admin/invitations/${crypto.randomUUID()}`, {
      method: 'DELETE',
      headers: { cookie },
    }, env);
    expect(res.status).toBe(404);
  });

  it('returns 404 when trying to revoke a course-scoped invitation through this endpoint', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const token = `test-token-${crypto.randomUUID()}`;
    const tokenHash = await sha256Hex(token);
    await createInvitation(env.DB, {
      id: crypto.randomUUID(),
      email: `course-${crypto.randomUUID()}@example.com`,
      name: 'Course Invite',
      isAdmin: false,
      canTeach: false,
      courseId: crypto.randomUUID(),
      membershipRole: 'student',
      targetUserId: null,
      tokenHash,
      expiresAt: sqliteTimestamp(60_000),
      invitedBy: null,
    });
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);

    const cookie = await loginAs(app, admin.id);
    const res = await app.request(`/admin/invitations/${invitation!.id}`, {
      method: 'DELETE',
      headers: { cookie },
    }, env);
    expect(res.status).toBe(404);
  });
});
