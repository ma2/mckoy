// `sessions` テーブルへのデータアクセス。ログイン成功時に発行されるサーバー側
// セッション。Cookieには生トークンのみを載せ、DBにはそのハッシュ値(id)を保存する
// （招待トークンと同じ、漏洩耐性のための設計）。

export type SessionRow = {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
};

/** 新しいセッションを作成する。idにはトークンそのものではなくハッシュ値を渡すこと。 */
export async function insertSession(
  db: D1Database,
  params: { tokenHash: string; userId: string; expiresAt: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(params.tokenHash, params.userId, params.expiresAt)
    .run();
}

/** リクエストのCookieから取り出したトークンをハッシュ化した値で、有効なセッションかを確認する。 */
export async function getSessionByTokenHash(db: D1Database, tokenHash: string): Promise<SessionRow | null> {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').bind(tokenHash).first<SessionRow>();
}

/** ログアウト時にセッションを破棄する。 */
export async function deleteSessionByTokenHash(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(tokenHash).run();
}
