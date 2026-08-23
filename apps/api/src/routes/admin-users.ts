import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireSession, requireAdmin } from '../auth/session';
import { listUsers } from '../db/users';
import { deletePasskeyByOwner, listPasskeysByUserId } from '../db/passkeys';

// 管理者によるユーザー一覧・パスキー手動復旧（仕様書 §7.1）。パスキーをすべて
// 失ったユーザーについて、管理者が既存パスキーを失効させた上で
// 再登録用の招待URL（routes/admin-invitations.ts）を別途発行する運用を想定する。

export const adminUsersRoute = new Hono<AppEnv>();

adminUsersRoute.use('*', requireSession, requireAdmin);

/** 全ユーザー一覧。手動復旧の対象ユーザーを選ぶために使う。 */
adminUsersRoute.get('/', async (c) => {
  const users = await listUsers(c.env.DB);
  return c.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isAdmin: u.isAdmin,
      canTeach: u.canTeach,
    })),
  });
});

/** 指定ユーザーの登録済みパスキー一覧。 */
adminUsersRoute.get('/:userId/passkeys', async (c) => {
  const passkeys = await listPasskeysByUserId(c.env.DB, c.req.param('userId'));
  return c.json({
    passkeys: passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.created_at,
      lastUsedAt: p.last_used_at,
    })),
  });
});

/**
 * 指定ユーザーのパスキーを失効させる。本人によるセルフサービス削除と異なり、
 * 最後の1件でも削除できる（失効後、管理者が再登録用の招待URLを発行する運用のため）。
 */
adminUsersRoute.delete('/:userId/passkeys/:id', async (c) => {
  const deleted = await deletePasskeyByOwner(c.env.DB, c.req.param('id'), c.req.param('userId'));
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.body(null, 204);
});
