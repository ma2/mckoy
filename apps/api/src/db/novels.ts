// `novels` テーブルへのデータアクセス。可視性判定（誰が読めるか）は
// routes/novels.ts の canViewNovel() に集約されており、ここでは行わない。

export type NovelVisibility = 'instructors' | 'course_students' | 'all_users';

export type NovelRow = {
  id: string;
  author_id: string;
  course_id: string;
  title: string;
  body: string;
  visibility: NovelVisibility;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_comment: string | null;
  created_at: string;
  updated_at: string;
};

export async function createNovel(
  db: D1Database,
  params: { id: string; authorId: string; courseId: string; title: string; body: string; visibility: NovelVisibility },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO novels (id, author_id, course_id, title, body, visibility) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(params.id, params.authorId, params.courseId, params.title, params.body, params.visibility)
    .run();
}

/** 削除済みかどうかを問わず1件取得する。削除済みを弾くかは呼び出し側（routes/novels.ts）の責務。 */
export async function getNovelById(db: D1Database, id: string): Promise<NovelRow | null> {
  return db.prepare('SELECT * FROM novels WHERE id = ?').bind(id).first<NovelRow>();
}

/** 論理削除済み（deleted_at IS NOT NULL）を除いた、講座内の小説一覧。visibilityによる絞り込みは呼び出し側で行う。 */
export async function listNovelsByCourse(db: D1Database, courseId: string): Promise<NovelRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM novels WHERE course_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
    .bind(courseId)
    .all<NovelRow>();
  return results;
}

/** title/body/visibility を更新する。改訂履歴(novel_revisions)への保存は呼び出し側の責務。 */
export async function updateNovel(
  db: D1Database,
  id: string,
  params: { title: string; body: string; visibility: NovelVisibility },
): Promise<void> {
  await db
    .prepare(
      "UPDATE novels SET title = ?, body = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(params.title, params.body, params.visibility, id)
    .run();
}

/** 論理削除する（物理削除ではない）。仕様書 §12 のとおり、以後 deleted_at IS NULL のクエリからは除外される。 */
export async function softDeleteNovel(
  db: D1Database,
  id: string,
  params: { deletedBy: string; deletionComment: string | null },
): Promise<void> {
  await db
    .prepare(
      "UPDATE novels SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, deletion_comment = ? WHERE id = ?",
    )
    .bind(params.deletedBy, params.deletionComment, id)
    .run();
}
