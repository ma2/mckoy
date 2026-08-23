// `comments` テーブルへのデータアクセス。小説へのコメントは講師（または管理者）のみ
// 投稿可（仕様書 §13）。編集・削除・スレッド化・返信は初版スコープ外のため未実装。

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

/** コメントを投稿する。投稿権限（対象講座のactive講師 or 管理者）の確認は呼び出し側（routes/novels.ts）の責務。 */
export async function createComment(
  db: D1Database,
  params: { id: string; novelId: string; userId: string; body: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO comments (id, novel_id, user_id, body) VALUES (?, ?, ?, ?)')
    .bind(params.id, params.novelId, params.userId, params.body)
    .run();
}

/**
 * 小説へのコメントを新しい順に、投稿者の氏名付きで返す（issue #18）。閲覧可否は
 * 小説自体のvisibilityに従う（呼び出し側で判定）。created_atは秒単位の精度しかないため、
 * 同じ秒内に複数件投稿されても順序が不定にならないようrowidを第2キーにする。
 */
export async function listCommentsByNovel(db: D1Database, novelId: string): Promise<CommentWithUserRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*, u.name as user_name
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.novel_id = ?
       ORDER BY c.created_at DESC, c.rowid DESC`,
    )
    .bind(novelId)
    .all<CommentWithUserRow>();
  return results;
}
