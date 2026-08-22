// `announcements` テーブルへのデータアクセス。お知らせの作成は対象講座のactive講師/
// 管理者のみ、閲覧は対象講座のactive membershipを持つユーザーのみ（仕様書 §15）。

export type AnnouncementRow = {
  id: string;
  course_id: string;
  title: string;
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** お知らせを作成する。作成権限の確認は呼び出し側（routes/courses.ts）の責務。 */
export async function createAnnouncement(
  db: D1Database,
  params: { id: string; courseId: string; title: string; body: string; createdBy: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO announcements (id, course_id, title, body, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind(params.id, params.courseId, params.title, params.body, params.createdBy)
    .run();
}

/** 講座内のお知らせ一覧を新しい順に返す。 */
export async function listAnnouncementsByCourse(db: D1Database, courseId: string): Promise<AnnouncementRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM announcements WHERE course_id = ? ORDER BY created_at DESC, rowid DESC')
    .bind(courseId)
    .all<AnnouncementRow>();
  return results;
}
