import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireSession, requireAdmin } from '../auth/session';
import { getUserById, listUsers, updateUser } from '../db/users';
import { deletePasskeyByOwner, listPasskeysByUserId } from '../db/passkeys';
import { issueInvitation } from '../auth/invitation';

// 管理者によるユーザー一覧・パスキー手動復旧（仕様書 §7.1）。パスキーをすべて
// 失ったユーザーについて、管理者が既存パスキーを失効させた上で、同じユーザーへの
// パスキー再登録招待（target_user_id付き招待、routes/invitations.ts側で新規アカウント
// 作成ではなく既存ユーザーへのパスキー追加として扱われる）を発行する。

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

/**
 * 既存ユーザーの権限フラグ（講師資格 can_teach / 管理者権限 is_admin）を更新する
 * （issue #43、仕様書 §22「ユーザー編集」「講師資格管理」「管理者権限管理」）。
 *
 * - can_teach は付与・はく奪どちらも可能。
 * - is_admin は付与のみ可能。はく奪（false 化）はこのエンドポイントでは常に拒否する
 *   — 悪意ある管理者が他の管理者を締め出してシステムを乗っ取ることを防ぐため、
 *   管理者権限のはく奪はWeb経由では行わず、運用スクリプト
 *   （`npm run revoke:admin`、scripts/revoke-admin.mjs）でのみ実施する。
 */
adminUsersRoute.patch('/:userId', async (c) => {
  const target = await getUserById(c.env.DB, c.req.param('userId'));
  if (!target) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.json<{ isAdmin?: boolean; canTeach?: boolean }>().catch(() => null);
  if (!body) return c.json({ error: 'invalid_body' }, 400);
  if (body.isAdmin !== undefined && typeof body.isAdmin !== 'boolean') {
    return c.json({ error: 'invalid_body' }, 400);
  }
  if (body.canTeach !== undefined && typeof body.canTeach !== 'boolean') {
    return c.json({ error: 'invalid_body' }, 400);
  }
  if (body.isAdmin === false) {
    return c.json({ error: 'admin_revoke_forbidden' }, 400);
  }

  await updateUser(c.env.DB, target.id, { isAdmin: body.isAdmin, canTeach: body.canTeach });

  const updated = await getUserById(c.env.DB, target.id);
  return c.json({
    user: {
      id: updated!.id,
      name: updated!.name,
      email: updated!.email,
      isAdmin: updated!.isAdmin,
      canTeach: updated!.canTeach,
    },
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

/**
 * 既存ユーザーへのパスキー再登録用招待URLを発行する（仕様書 §7.1 手動復旧フロー手順4）。
 * target_user_idを設定した招待になり、受諾時（routes/invitations.ts）は新規アカウントを
 * 作らず既存ユーザーへパスキーを追加するだけになるため、講座membership・投稿した小説等の
 * 既存データがそのまま引き継がれる。
 */
adminUsersRoute.post('/:userId/passkey-reset-invitation', async (c) => {
  const target = await getUserById(c.env.DB, c.req.param('userId'));
  if (!target) return c.json({ error: 'not_found' }, 404);

  const token = await issueInvitation(c.env.DB, {
    name: target.name,
    email: target.email,
    isAdmin: target.isAdmin,
    canTeach: target.canTeach,
    courseId: null,
    membershipRole: null,
    targetUserId: target.id,
    invitedBy: c.get('user').id,
  });

  return c.json({ invitationUrl: `${c.env.RP_ORIGIN}/invitations/${token}` }, 201);
});
