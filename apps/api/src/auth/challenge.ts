import { sqliteTimestamp } from '../util/time';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengePurpose = 'registration' | 'authentication';

export async function storeChallenge(
  db: D1Database,
  params: { challenge: string; userId: string | null; purpose: ChallengePurpose },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO webauthn_challenges (id, challenge, user_id, purpose, expires_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), params.challenge, params.userId, params.purpose, sqliteTimestamp(CHALLENGE_TTL_MS))
    .run();
}

/**
 * Marks a stored, unexpired challenge as used. Returns false if the challenge
 * is unknown, expired, or already used -- callers must treat that as a
 * verification failure, since WebAuthn challenges are single-use.
 */
export async function consumeChallenge(
  db: D1Database,
  params: { challenge: string; purpose: ChallengePurpose },
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT id FROM webauthn_challenges WHERE challenge = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?',
    )
    .bind(params.challenge, params.purpose, sqliteTimestamp())
    .first<{ id: string }>();
  if (!row) return false;
  await db.prepare('UPDATE webauthn_challenges SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(row.id).run();
  return true;
}
