// `course_memberships` テーブルへのデータアクセス。ユーザーと講座の多対多関係
// （join table）で、role/statusの組み合わせが権限判定の中心になる。仕様書 §9, §17 参照。

export type MembershipRole = 'instructor' | 'student';
export type MembershipStatus = 'pending' | 'active' | 'rejected';

export type MembershipRow = {
  id: string;
  course_id: string;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
};

export type MembershipWithUserRow = MembershipRow & {
  user_name: string;
  user_email: string;
};

export async function createMembership(
  db: D1Database,
  params: { id: string; courseId: string; userId: string; role: MembershipRole; status: MembershipStatus },
): Promise<void> {
  await db
    .prepare('INSERT INTO course_memberships (id, course_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)')
    .bind(params.id, params.courseId, params.userId, params.role, params.status)
    .run();
}

/** 認可判定の核: あるユーザーがある講座で何者か（role/status）を1件返す。無ければnull。 */
export async function getMembershipByCourseAndUser(
  db: D1Database,
  courseId: string,
  userId: string,
): Promise<MembershipRow | null> {
  return db
    .prepare('SELECT * FROM course_memberships WHERE course_id = ? AND user_id = ?')
    .bind(courseId, userId)
    .first<MembershipRow>();
}

/** membership id から行を取得する。承認/拒否APIで、対象membershipが本当にその講座のものか検証する際に使う。 */
export async function getMembershipById(db: D1Database, id: string): Promise<MembershipRow | null> {
  return db.prepare('SELECT * FROM course_memberships WHERE id = ?').bind(id).first<MembershipRow>();
}

/** 講座のメンバー一覧（氏名・メール付き）。参加申請の承認待ち一覧表示にも使う。 */
export async function listMembershipsByCourse(db: D1Database, courseId: string): Promise<MembershipWithUserRow[]> {
  const { results } = await db
    .prepare(
      `SELECT cm.*, u.name as user_name, u.email as user_email
       FROM course_memberships cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.course_id = ?
       ORDER BY cm.created_at ASC`,
    )
    .bind(courseId)
    .all<MembershipWithUserRow>();
  return results;
}

/** あるユーザーが持つ全membershipを講座横断で返す。講座一覧で「自分は各講座で何者か」を一括表示するために使う。 */
export async function listMembershipsByUser(db: D1Database, userId: string): Promise<MembershipRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM course_memberships WHERE user_id = ?')
    .bind(userId)
    .all<MembershipRow>();
  return results;
}

/** 参加申請の承認（active）・拒否（rejected）でstatusを更新する。 */
export async function updateMembershipStatus(db: D1Database, id: string, status: MembershipStatus): Promise<void> {
  await db
    .prepare("UPDATE course_memberships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, id)
    .run();
}

/** 「その講座のactiveな講師か」という、認可チェックで最も頻繁に使う判定。routes/courses.ts の canManageCourse 等から呼ばれる。 */
export async function isActiveInstructor(db: D1Database, courseId: string, userId: string): Promise<boolean> {
  const membership = await getMembershipByCourseAndUser(db, courseId, userId);
  return membership !== null && membership.role === 'instructor' && membership.status === 'active';
}
