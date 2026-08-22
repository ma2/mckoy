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

export async function getNovelById(db: D1Database, id: string): Promise<NovelRow | null> {
  return db.prepare('SELECT * FROM novels WHERE id = ?').bind(id).first<NovelRow>();
}

export async function listNovelsByCourse(db: D1Database, courseId: string): Promise<NovelRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM novels WHERE course_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
    .bind(courseId)
    .all<NovelRow>();
  return results;
}

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
