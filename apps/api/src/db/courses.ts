export type CourseRow = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

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

export async function listCourses(db: D1Database): Promise<CourseRow[]> {
  const { results } = await db.prepare('SELECT * FROM courses ORDER BY created_at DESC').all<CourseRow>();
  return results;
}

export async function updateCourse(
  db: D1Database,
  id: string,
  params: { name?: string; description?: string | null },
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
}
