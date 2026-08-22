import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  createInvitation,
  getInvitationByTokenHash,
  isInvitationUsable,
  markInvitationUsed,
} from '../src/db/invitations';
import { sha256Hex } from '../src/util/crypto';
import { sqliteTimestamp } from '../src/util/time';

async function seedInvitation(overrides: { expiresAt?: string; used?: boolean; revoked?: boolean } = {}) {
  const token = `test-token-${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);
  await createInvitation(env.DB, {
    id: crypto.randomUUID(),
    email: 'student@example.com',
    name: 'Student',
    isAdmin: false,
    canTeach: false,
    tokenHash,
    expiresAt: overrides.expiresAt ?? sqliteTimestamp(60_000),
    invitedBy: null,
  });
  const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
  if (overrides.used) {
    await markInvitationUsed(env.DB, invitation!.id);
  }
  if (overrides.revoked) {
    await env.DB.prepare('UPDATE invitations SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(invitation!.id)
      .run();
  }
  return tokenHash;
}

describe('invitation usability', () => {
  it('is usable when unexpired, unused, and unrevoked', async () => {
    const tokenHash = await seedInvitation();
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    expect(isInvitationUsable(invitation!, sqliteTimestamp())).toBe(true);
  });

  it('rejects an expired invitation', async () => {
    const tokenHash = await seedInvitation({ expiresAt: sqliteTimestamp(-60_000) });
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    expect(isInvitationUsable(invitation!, sqliteTimestamp())).toBe(false);
  });

  it('rejects an already-used invitation', async () => {
    const tokenHash = await seedInvitation({ used: true });
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    expect(isInvitationUsable(invitation!, sqliteTimestamp())).toBe(false);
  });

  it('rejects a revoked invitation', async () => {
    const tokenHash = await seedInvitation({ revoked: true });
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    expect(isInvitationUsable(invitation!, sqliteTimestamp())).toBe(false);
  });
});
