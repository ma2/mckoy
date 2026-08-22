import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireSession, requireAdmin } from '../auth/session';
import { issueInvitation } from '../auth/invitation';

export const adminInvitationsRoute = new Hono<AppEnv>();

adminInvitationsRoute.use('*', requireSession, requireAdmin);

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
