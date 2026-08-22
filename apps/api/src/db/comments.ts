export type CommentRow = {
  id: string;
  novel_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type CommentWithUserRow = CommentRow & {
  user_name: string;
};

export async function createComment(
  db: D1Database,
  params: { id: string; novelId: string; userId: string; body: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO comments (id, novel_id, user_id, body) VALUES (?, ?, ?, ?)')
    .bind(params.id, params.novelId, params.userId, params.body)
    .run();
}

export async function listCommentsByNovel(db: D1Database, novelId: string): Promise<CommentWithUserRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*, u.name as user_name
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.novel_id = ?
       ORDER BY c.created_at ASC, c.rowid ASC`,
    )
    .bind(novelId)
    .all<CommentWithUserRow>();
  return results;
}
