import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/types';
import { issueSession, requireSession } from '../src/auth/session';
import { createUser } from '../src/db/users';
import { insertSession } from '../src/db/sessions';
import { sha256Hex } from '../src/util/crypto';
import { sqliteTimestamp } from '../src/util/time';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.post('/login-as/:userId', async (c) => {
    await issueSession(c, c.req.param('userId'));
    return c.body(null, 204);
  });
  app.get('/me', requireSession, (c) => c.json({ user: c.get('user') }));
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

describe('session middleware', () => {
  it('rejects a request with no session cookie', async () => {
    const res = await buildApp().request('/me', {}, env);
    expect(res.status).toBe(401);
  });

  it('accepts a request carrying a freshly issued session cookie', async () => {
    const app = buildApp();
    const user = await createTestUser();

    const loginRes = await app.request(`/login-as/${user.id}`, { method: 'POST' }, env);
    const cookie = loginRes.headers.get('set-cookie');
    expect(cookie).toBeTruthy();

    const meRes = await app.request('/me', { headers: { cookie: cookie!.split(';')[0]! } }, env);
    expect(meRes.status).toBe(200);
    const body = await meRes.json<{ user: { id: string } }>();
    expect(body.user.id).toBe(user.id);
  });

  it('rejects an expired session', async () => {
    const user = await createTestUser();
    const token = `expired-${crypto.randomUUID()}`;
    await insertSession(env.DB, {
      tokenHash: await sha256Hex(token),
      userId: user.id,
      expiresAt: sqliteTimestamp(-60_000),
    });

    const res = await buildApp().request('/me', { headers: { cookie: `mckoy_session=${token}` } }, env);
    expect(res.status).toBe(401);
  });

  it('rejects an unknown session token', async () => {
    const res = await buildApp().request(
      '/me',
      { headers: { cookie: 'mckoy_session=does-not-exist' } },
      env,
    );
    expect(res.status).toBe(401);
  });
});
