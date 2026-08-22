import { Hono } from 'hono';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { AppEnv } from '../types';
import { createAuthenticationOptions, verifyAuthentication } from '../auth/webauthn';
import { issueSession, endSession, requireSession } from '../auth/session';
import { getUserById } from '../db/users';

export const authRoute = new Hono<AppEnv>();

authRoute.post('/login/options', async (c) => {
  const options = await createAuthenticationOptions(c.env.DB, c.env);
  return c.json(options);
});

authRoute.post('/login/verify', async (c) => {
  const body = await c.req.json<AuthenticationResponseJSON>();
  const result = await verifyAuthentication(c.env.DB, c.env, body);
  if (!result) return c.json({ error: 'verification_failed' }, 400);

  const user = await getUserById(c.env.DB, result.userId);
  if (!user) return c.json({ error: 'verification_failed' }, 400);

  await issueSession(c, user.id);
  return c.json({ user });
});

authRoute.post('/logout', requireSession, async (c) => {
  await endSession(c);
  return c.body(null, 204);
});
