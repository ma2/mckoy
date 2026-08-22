export type AnnouncementRow = {
  id: string;
  course_id: string;
  title: string;
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function createAnnouncement(
  db: D1Database,
  params: { id: string; courseId: string; title: string; body: string; createdBy: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO announcements (id, course_id, title, body, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind(params.id, params.courseId, params.title, params.body, params.createdBy)
    .run();
}

export async function listAnnouncementsByCourse(db: D1Database, courseId: string): Promise<AnnouncementRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM announcements WHERE course_id = ? ORDER BY created_at DESC, rowid DESC')
    .bind(courseId)
    .all<AnnouncementRow>();
  return results;
}
