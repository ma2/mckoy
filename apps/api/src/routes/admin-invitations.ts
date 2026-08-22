import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireSession, requireAdmin } from '../auth/session';
import { issueInvitation } from '../auth/invitation';

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
