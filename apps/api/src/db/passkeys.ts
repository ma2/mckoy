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

export async function getPasskeyByCredentialId(db: D1Database, credentialId: string): Promise<PasskeyRow | null> {
  return db.prepare('SELECT * FROM passkeys WHERE credential_id = ?').bind(credentialId).first<PasskeyRow>();
}

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

export async function touchPasskeyUsage(db: D1Database, id: string, counter: number): Promise<void> {
  await db
    .prepare("UPDATE passkeys SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(counter, id)
    .run();
}

/** Deletes a passkey only if it belongs to userId; returns whether a row was deleted. */
export async function deleteOwnPasskey(db: D1Database, id: string, userId: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function countPasskeysByUserId(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM passkeys WHERE user_id = ?')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}
