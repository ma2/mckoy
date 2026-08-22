import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireSession, requireAdmin } from '../auth/session';
import { createInvitation } from '../db/invitations';
import { sha256Hex, randomToken } from '../util/crypto';
import { sqliteTimestamp } from '../util/time';

export const adminInvitationsRoute = new Hono<AppEnv>();

adminInvitationsRoute.use('*', requireSession, requireAdmin);

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

adminInvitationsRoute.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; isAdmin?: boolean; canTeach?: boolean }>();
  if (!body.name || !body.email) {
    return c.json({ error: 'name_and_email_required' }, 400);
  }

  const token = randomToken();
  await createInvitation(c.env.DB, {
    id: crypto.randomUUID(),
    email: body.email,
    name: body.name,
    isAdmin: body.isAdmin ?? false,
    canTeach: body.canTeach ?? false,
    tokenHash: await sha256Hex(token),
    expiresAt: sqliteTimestamp(INVITATION_TTL_MS),
    invitedBy: c.get('user').id,
  });

  return c.json({ invitationUrl: `${c.env.RP_ORIGIN}/invitations/${token}` }, 201);
});
