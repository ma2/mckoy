import { Hono, type Context } from 'hono';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { AppEnv } from '../types';
import { sha256Hex } from '../util/crypto';
import { sqliteTimestamp } from '../util/time';
import { getInvitationByTokenHash, isInvitationUsable, markInvitationUsed } from '../db/invitations';
import { createUser, getUserByEmail } from '../db/users';
import { createPasskey } from '../db/passkeys';
import { createRegistrationOptions, verifyRegistration } from '../auth/webauthn';
import { issueSession } from '../auth/session';

export const invitationsRoute = new Hono<AppEnv>();

async function loadUsableInvitation(c: Context<AppEnv>, db: D1Database) {
  const token = c.req.param('token');
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const invitation = await getInvitationByTokenHash(db, tokenHash);
  if (!invitation || !isInvitationUsable(invitation, sqliteTimestamp())) return null;
  return invitation;
}

invitationsRoute.get('/:token', async (c) => {
  const invitation = await loadUsableInvitation(c, c.env.DB);
  if (!invitation) return c.json({ error: 'invitation_not_found' }, 404);
  return c.json({ name: invitation.name, email: invitation.email });
});

invitationsRoute.post('/:token/register/options', async (c) => {
  const invitation = await loadUsableInvitation(c, c.env.DB);
  if (!invitation) return c.json({ error: 'invitation_not_found' }, 404);

  const existingUser = await getUserByEmail(c.env.DB, invitation.email);
  if (existingUser) return c.json({ error: 'already_registered' }, 409);

  // Use a stable placeholder id (derived from the invitation) so the WebAuthn
  // excludeCredentials/userHandle logic has something to key off of before the
  // user row actually exists; the real user is only created on verify.
  const options = await createRegistrationOptions(c.env.DB, c.env, {
    id: invitation.id,
    name: invitation.name,
    email: invitation.email,
  });
  return c.json(options);
});

invitationsRoute.post('/:token/register/verify', async (c) => {
  const invitation = await loadUsableInvitation(c, c.env.DB);
  if (!invitation) return c.json({ error: 'invitation_not_found' }, 404);

  const existingUser = await getUserByEmail(c.env.DB, invitation.email);
  if (existingUser) return c.json({ error: 'already_registered' }, 409);

  const body = await c.req.json<RegistrationResponseJSON>();
  const verified = await verifyRegistration(c.env.DB, c.env, body);
  if (!verified) return c.json({ error: 'verification_failed' }, 400);

  const user = await createUser(c.env.DB, {
    id: invitation.id,
    name: invitation.name,
    email: invitation.email,
    isAdmin: invitation.is_admin === 1,
    canTeach: invitation.can_teach === 1,
  });
  await createPasskey(c.env.DB, {
    id: crypto.randomUUID(),
    userId: user.id,
    credentialId: verified.credentialId,
    publicKey: verified.publicKey,
    counter: verified.counter,
    transports: verified.transports,
    name: null,
  });
  await markInvitationUsed(c.env.DB, invitation.id);
  await issueSession(c, user.id);

  return c.json({ user });
});
