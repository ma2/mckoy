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

export async function createAssignment(
  db: D1Database,
  params: { id: string; courseId: string; title: string; body: string; dueAt: string | null; createdBy: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO assignments (id, course_id, title, body, due_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(params.id, params.courseId, params.title, params.body, params.dueAt, params.createdBy)
    .run();
}

export async function listAssignmentsByCourse(db: D1Database, courseId: string): Promise<AssignmentRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM assignments WHERE course_id = ? ORDER BY created_at DESC, rowid DESC')
    .bind(courseId)
    .all<AssignmentRow>();
  return results;
}
