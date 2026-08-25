// `courses` テーブルへのデータアクセス。

export type CourseStatus = 'open' | 'closed' | 'closed_readonly';

export type CourseRow = {
  id: string;
  name: string;
  description: string | null;
  status: CourseStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** 講座を新規作成する。name には UNIQUE 制約があるため、重複時は呼び出し側で例外を捕捉すること。 */
export async function createCourse(
  db: D1Database,
  params: { id: string; name: string; description: string | null; createdBy: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO courses (id, name, description, created_by) VALUES (?, ?, ?, ?)')
    .bind(params.id, params.name, params.description, params.createdBy)
    .run();
}

export async function getCourseById(db: D1Database, id: string): Promise<CourseRow | null> {
  return db.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first<CourseRow>();
}

/** 講座一覧を新しい順に返す。ログイン済みなら誰でも閲覧可（講座自体は非公開情報ではない）。 */
export async function listCourses(db: D1Database): Promise<CourseRow[]> {
  const { results } = await db.prepare('SELECT * FROM courses ORDER BY created_at DESC').all<CourseRow>();
  return results;
}

/** name・description・status を部分更新する（渡されたフィールドのみ更新）。 */
export async function updateCourse(
  db: D1Database,
  id: string,
  params: { name?: string; description?: string | null; status?: CourseStatus },
): Promise<void> {
  if (params.name !== undefined) {
    await db
      .prepare("UPDATE courses SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(params.name, id)
      .run();
  }
  if (params.description !== undefined) {
    await db
      .prepare("UPDATE courses SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(params.description, id)
      .run();
  }
  if (params.status !== undefined) {
    await db
      .prepare("UPDATE courses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(params.status, id)
      .run();
  }
}
