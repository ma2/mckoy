// `assignments` テーブルへのデータアクセス。課題の作成は対象講座のactive講師/管理者のみ、
// 閲覧は対象講座のactive membershipを持つユーザーのみ（お知らせと同じ扱いに揃えている）。

export type AssignmentRow = {
  id: string;
  course_id: string;
  title: string;
  body: string;
  due_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** 課題を作成する。作成権限の確認は呼び出し側（routes/courses.ts）の責務。 */
export async function createAssignment(
  db: D1Database,
  params: { id: string; courseId: string; title: string; body: string; dueAt: string | null; createdBy: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO assignments (id, course_id, title, body, due_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(params.id, params.courseId, params.title, params.body, params.dueAt, params.createdBy)
    .run();
}

/** 講座内の課題一覧を新しい順に返す。 */
export async function listAssignmentsByCourse(db: D1Database, courseId: string): Promise<AssignmentRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM assignments WHERE course_id = ? ORDER BY created_at DESC, rowid DESC')
    .bind(courseId)
    .all<AssignmentRow>();
  return results;
}
