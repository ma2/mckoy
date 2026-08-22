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

export async function getMembershipById(db: D1Database, id: string): Promise<MembershipRow | null> {
  return db.prepare('SELECT * FROM course_memberships WHERE id = ?').bind(id).first<MembershipRow>();
}

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

export async function updateMembershipStatus(db: D1Database, id: string, status: MembershipStatus): Promise<void> {
  await db
    .prepare("UPDATE course_memberships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, id)
    .run();
}

export async function isActiveInstructor(db: D1Database, courseId: string, userId: string): Promise<boolean> {
  const membership = await getMembershipByCourseAndUser(db, courseId, userId);
  return membership !== null && membership.role === 'instructor' && membership.status === 'active';
}
