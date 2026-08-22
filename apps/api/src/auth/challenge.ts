import { sqliteTimestamp } from '../util/time';

// WebAuthn の challenge を D1 に保存・消費する。一度きり・短命という性質
// （仕様書 §20）を、DBの used_at/expires_at で担保する。

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengePurpose = 'registration' | 'authentication';

/** 登録/認証オプションを発行するたびに呼び、challenge を短命な状態で保存する。 */
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
 * 保存済み・未失効のchallengeを使用済みにする。challengeが未知・期限切れ・
 * 使用済みのいずれかであれば false を返す — WebAuthnのchallengeは一度きりの
 * 使用しか許されないため、呼び出し側はこれを検証失敗として扱うこと。
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
