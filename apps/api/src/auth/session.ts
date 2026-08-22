import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Bindings } from '../env';
import type { AppEnv } from '../types';
import { sha256Hex, randomToken } from '../util/crypto';
import { sqliteTimestamp } from '../util/time';
import { getUserById, type User } from '../db/users';
import { insertSession, getSessionByTokenHash, deleteSessionByTokenHash } from '../db/sessions';

const SESSION_COOKIE_NAME = 'mckoy_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isSecure(env: Bindings): boolean {
  return env.SESSION_COOKIE_SECURE !== 'false';
}

export async function issueSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await insertSession(c.env.DB, { tokenHash, userId, expiresAt: sqliteTimestamp(SESSION_TTL_MS) });
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure(c.env),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    await deleteSessionByTokenHash(c.env.DB, await sha256Hex(token));
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/', secure: isSecure(c.env), httpOnly: true, sameSite: 'Lax' });
}

async function resolveSessionUser(c: Context<AppEnv>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await getSessionByTokenHash(c.env.DB, tokenHash);
  if (!session) return null;
  if (session.expires_at <= sqliteTimestamp()) return null;
  return getUserById(c.env.DB, session.user_id);
}

/** Rejects with 401 unless a valid, unexpired session cookie resolves to a user. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await resolveSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  c.set('user', user);
  await next();
};

/** Rejects with 403 unless the authenticated user is an admin. Must run after requireSession. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user.isAdmin) {
    return c.json({ error: 'forbidden' }, 403);
  }
  await next();
};
