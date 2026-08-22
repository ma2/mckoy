export type InvitationRow = {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  can_teach: number;
  course_id: string | null;
  membership_role: string | null;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  created_at: string;
};

export async function getInvitationByTokenHash(db: D1Database, tokenHash: string): Promise<InvitationRow | null> {
  return db.prepare('SELECT * FROM invitations WHERE token_hash = ?').bind(tokenHash).first<InvitationRow>();
}

export async function createInvitation(
  db: D1Database,
  params: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    canTeach: boolean;
    courseId: string | null;
    membershipRole: 'instructor' | 'student' | null;
    tokenHash: string;
    expiresAt: string;
    invitedBy: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO invitations
         (id, email, name, is_admin, can_teach, course_id, membership_role, token_hash, expires_at, invited_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.id,
      params.email,
      params.name,
      params.isAdmin ? 1 : 0,
      params.canTeach ? 1 : 0,
      params.courseId,
      params.membershipRole,
      params.tokenHash,
      params.expiresAt,
      params.invitedBy,
    )
    .run();
}

export async function markInvitationUsed(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
}

/** An invitation is usable if it hasn't been used, revoked, or expired. */
export function isInvitationUsable(invitation: InvitationRow, nowIso: string): boolean {
  return invitation.used_at === null && invitation.revoked_at === null && invitation.expires_at > nowIso;
}
