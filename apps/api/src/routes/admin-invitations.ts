import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireSession, requireAdmin } from '../auth/session';
import { issueInvitation } from '../auth/invitation';
import { getInvitationById, listInvitations, revokeInvitation } from '../db/invitations';

// 講座に紐付かない招待（管理者・講師資格の付与）。管理者のみ発行できる（仕様書 §5.2）。
// 講座紐付きの生徒招待は routes/courses.ts の POST /:id/invitations が担当する。

export const adminInvitationsRoute = new Hono<AppEnv>();

adminInvitationsRoute.use('*', requireSession, requireAdmin);

/** 招待を作成し、招待URLを返す（メール自動送信はしない。仕様書 §5.5）。 */
adminInvitationsRoute.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; isAdmin?: boolean; canTeach?: boolean }>();
  if (!body.name || !body.email) {
    return c.json({ error: 'name_and_email_required' }, 400);
  }

  const token = await issueInvitation(c.env.DB, {
    name: body.name,
    email: body.email,
    isAdmin: body.isAdmin ?? false,
    canTeach: body.canTeach ?? false,
    courseId: null,
    membershipRole: null,
    invitedBy: c.get('user').id,
  });

  return c.json({ invitationUrl: `${c.env.RP_ORIGIN}/invitations/${token}` }, 201);
});

/** 講座に紐付かない招待の一覧（新しい順）。今どんな招待が発行済み・未使用かを確認できる（仕様書 §5.4）。 */
adminInvitationsRoute.get('/', async (c) => {
  const invitations = await listInvitations(c.env.DB, null);
  return c.json({
    invitations: invitations.map((i) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      isAdmin: i.is_admin === 1,
      canTeach: i.can_teach === 1,
      expiresAt: i.expires_at,
      usedAt: i.used_at,
      revokedAt: i.revoked_at,
      createdAt: i.created_at,
    })),
  });
});

/** 招待を失効させる（仕様書 §5.4）。誤ったメールアドレス宛の招待や、不要になった招待を取り消す用途。 */
adminInvitationsRoute.delete('/:id', async (c) => {
  const invitation = await getInvitationById(c.env.DB, c.req.param('id'));
  if (!invitation || invitation.course_id !== null) return c.json({ error: 'not_found' }, 404);
  await revokeInvitation(c.env.DB, invitation.id);
  return c.body(null, 204);
});
