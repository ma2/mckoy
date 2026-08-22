export type SessionRow = {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
};

export async function insertSession(
  db: D1Database,
  params: { tokenHash: string; userId: string; expiresAt: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(params.tokenHash, params.userId, params.expiresAt)
    .run();
}

export async function getSessionByTokenHash(db: D1Database, tokenHash: string): Promise<SessionRow | null> {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').bind(tokenHash).first<SessionRow>();
}

export async function deleteSessionByTokenHash(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(tokenHash).run();
}
