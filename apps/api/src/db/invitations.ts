// `invitations` テーブルへのデータアクセス。すべてのアカウントはこの行を経由して
// 作成される（仕様書 §5 参照）。講座に紐付かない招待（管理者・講師付与、course_idはnull）、
// 講座紐付きの招待（生徒招待、登録時にactive membershipを付与）、既存ユーザーへの
// パスキー再登録招待（target_user_idが設定される、仕様書 §7.1）の3種類がある。

export type InvitationRow = {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  can_teach: number;
  course_id: string | null;
  membership_role: string | null;
  target_user_id: string | null;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  created_at: string;
};

/** トークン平文のSHA-256ハッシュから招待を検索する（平文はDBに保存しない）。 */
export async function getInvitationByTokenHash(db: D1Database, tokenHash: string): Promise<InvitationRow | null> {
  return db.prepare('SELECT * FROM invitations WHERE token_hash = ?').bind(tokenHash).first<InvitationRow>();
}

/** idから招待を取得する。一覧に無いidを失効させようとしていないか等の確認に使う。 */
export async function getInvitationById(db: D1Database, id: string): Promise<InvitationRow | null> {
  return db.prepare('SELECT * FROM invitations WHERE id = ?').bind(id).first<InvitationRow>();
}

/**
 * 招待一覧を新しい順に返す。courseId が null なら講座に紐付かない招待
 * （管理者・講師付与、routes/admin-invitations.ts）、それ以外ならその講座紐付きの
 * 生徒招待（routes/courses.ts）を返す。パスキー再登録招待（target_user_id付き）は
 * どちらの一覧にも含めない（生徒招待・管理者招待の管理画面で紛れて表示・誤って
 * 失効されるのを避けるため）。created_atは秒単位の精度しかないため、同じ秒内に
 * 複数件作成されても順序が不定にならないようrowidを第2キーにする。
 */
export async function listInvitations(db: D1Database, courseId: string | null): Promise<InvitationRow[]> {
  const query =
    courseId === null
      ? db.prepare(
          'SELECT * FROM invitations WHERE course_id IS NULL AND target_user_id IS NULL ORDER BY created_at DESC, rowid DESC',
        )
      : db
          .prepare(
            'SELECT * FROM invitations WHERE course_id = ? AND target_user_id IS NULL ORDER BY created_at DESC, rowid DESC',
          )
          .bind(courseId);
  const { results } = await query.all<InvitationRow>();
  return results;
}

/** 招待を失効させる（仕様書 §5.4）。物理削除はせず revoked_at を記録するのみ。 */
export async function revokeInvitation(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE invitations SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
}

/** 招待行を新規作成する。トークン生成込みの上位ラッパーは auth/invitation.ts の issueInvitation() を参照。 */
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
    targetUserId: string | null;
    tokenHash: string;
    expiresAt: string;
    invitedBy: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO invitations
         (id, email, name, is_admin, can_teach, course_id, membership_role, target_user_id, token_hash, expires_at, invited_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.id,
      params.email,
      params.name,
      params.isAdmin ? 1 : 0,
      params.canTeach ? 1 : 0,
      params.courseId,
      params.membershipRole,
      params.targetUserId,
      params.tokenHash,
      params.expiresAt,
      params.invitedBy,
    )
    .run();
}

/** 登録完了時に招待を使用済みにする（一度きりの使用を保証する）。 */
export async function markInvitationUsed(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
}

/** 使用済み・失効・期限切れのいずれでもなければ、その招待は利用可能。 */
export function isInvitationUsable(invitation: InvitationRow, nowIso: string): boolean {
  return invitation.used_at === null && invitation.revoked_at === null && invitation.expires_at > nowIso;
}
