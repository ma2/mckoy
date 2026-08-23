import { Hono } from 'hono';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { AppEnv } from '../types';
import { requireSession } from '../auth/session';
import { createRegistrationOptions, verifyRegistration } from '../auth/webauthn';
import { guessPasskeyName } from '../auth/device-name';
import { createPasskey, countPasskeysByUserId, deletePasskeyByOwner, listPasskeysByUserId } from '../db/passkeys';

// ログイン後の自分のパスキー管理（一覧・追加・削除）。仕様書 §7。

export const mePasskeysRoute = new Hono<AppEnv>();

mePasskeysRoute.use('*', requireSession);

/** 自分の登録済みパスキー一覧。 */
mePasskeysRoute.get('/', async (c) => {
  const passkeys = await listPasskeysByUserId(c.env.DB, c.get('user').id);
  return c.json({
    passkeys: passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.created_at,
      lastUsedAt: p.last_used_at,
    })),
  });
});

/** ログイン済みユーザーが追加のパスキーを登録する際のoptionsを発行する（招待経由の初回登録とは別ルート）。 */
mePasskeysRoute.post('/options', async (c) => {
  const user = c.get('user');
  const options = await createRegistrationOptions(c.env.DB, c.env, user);
  return c.json(options);
});

mePasskeysRoute.post('/verify', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<RegistrationResponseJSON>();
  const verified = await verifyRegistration(c.env.DB, c.env, body);
  if (!verified) return c.json({ error: 'verification_failed' }, 400);

  await createPasskey(c.env.DB, {
    id: crypto.randomUUID(),
    userId: user.id,
    credentialId: verified.credentialId,
    publicKey: verified.publicKey,
    counter: verified.counter,
    transports: verified.transports,
    name: guessPasskeyName(c.req.header('user-agent')),
  });
  return c.json({}, 201);
});

/** 自分のパスキーを削除する。最後の1件は削除できない（ログイン不能になるため）。 */
mePasskeysRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const remaining = await countPasskeysByUserId(c.env.DB, user.id);
  if (remaining <= 1) {
    return c.json({ error: 'cannot_delete_last_passkey' }, 409);
  }
  const deleted = await deletePasskeyByOwner(c.env.DB, c.req.param('id'), user.id);
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.body(null, 204);
});
