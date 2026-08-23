// `passkeys` テーブルへのデータアクセス。ユーザーごとに登録されたWebAuthn
// クレデンシャル。1ユーザーが複数持てる（端末ごとに1つ）。仕様書 §7 参照。

export type PasskeyRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

/** ログイン時のWebAuthn assertionが持つcredential idから、所有パスキー（＝ユーザー）を特定する。 */
export async function getPasskeyByCredentialId(db: D1Database, credentialId: string): Promise<PasskeyRow | null> {
  return db.prepare('SELECT * FROM passkeys WHERE credential_id = ?').bind(credentialId).first<PasskeyRow>();
}

/** 「登録済みパスキー一覧」表示と、新規登録時の excludeCredentials 構築の両方で使う。 */
export async function listPasskeysByUserId(db: D1Database, userId: string): Promise<PasskeyRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at ASC')
    .bind(userId)
    .all<PasskeyRow>();
  return results;
}

export async function createPasskey(
  db: D1Database,
  params: {
    id: string;
    userId: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    transports: string | null;
    name: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, transports, name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(params.id, params.userId, params.credentialId, params.publicKey, params.counter, params.transports, params.name)
    .run();
}

/** ログイン成功後に署名カウンタと最終利用日時を更新する（リプレイ検知のための記録）。 */
export async function touchPasskeyUsage(db: D1Database, id: string, counter: number): Promise<void> {
  await db
    .prepare("UPDATE passkeys SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(counter, id)
    .run();
}

/**
 * そのパスキーがuserIdの所有物である場合のみ削除する。削除できたかどうかを返す。
 * 本人によるセルフサービス削除（routes/me-passkeys.ts）と、管理者による手動復旧
 * 目的の削除（routes/admin-users.ts、仕様書 §7.1）の両方から呼ばれる。
 */
export async function deletePasskeyByOwner(db: D1Database, id: string, userId: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return (result.meta.changes ?? 0) > 0;
}

/** ユーザーが最後の1つのパスキーを削除してログイン不能になるのを防ぐために使う。 */
export async function countPasskeysByUserId(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM passkeys WHERE user_id = ?')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}
