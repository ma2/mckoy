import { Hono } from 'hono';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { AppEnv } from '../types';
import { createAuthenticationOptions, verifyAuthentication } from '../auth/webauthn';
import { issueSession, endSession, requireSession } from '../auth/session';
import { getUserById } from '../db/users';

// パスキーログイン（/login/options, /login/verify）とログアウト。
// アカウント登録は routes/invitations.ts（招待経由）が担当し、ここでは扱わない。

export const authRoute = new Hono<AppEnv>();

/** discoverable credential用のログインoptionsを発行する（メールアドレス入力不要）。 */
authRoute.post('/login/options', async (c) => {
  const options = await createAuthenticationOptions(c.env.DB, c.env);
  return c.json(options);
});

/** ログインレスポンスを検証し、成功したらセッションを発行する。 */
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
