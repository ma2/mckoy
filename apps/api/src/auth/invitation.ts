import { createInvitation } from '../db/invitations';
import { sha256Hex, randomToken } from '../util/crypto';
import { sqliteTimestamp } from '../util/time';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7日間。仕様書 §5.4

/**
 * 招待を発行する共通処理。管理者による講座非依存の招待（routes/admin-invitations.ts）、
 * 講師による講座紐付きの生徒招待（routes/courses.ts）、管理者による既存ユーザーへの
 * パスキー再登録招待（routes/admin-users.ts、targetUserId付き）の3箇所から使われる。
 * 招待行にはトークンのハッシュのみ保存し、生トークン（招待URLに使う）はここでだけ返す。
 */
export async function issueInvitation(
  db: D1Database,
  params: {
    name: string;
    email: string;
    isAdmin: boolean;
    canTeach: boolean;
    courseId: string | null;
    membershipRole: 'instructor' | 'student' | null;
    targetUserId?: string | null;
    invitedBy: string;
  },
): Promise<string> {
  const token = randomToken();
  await createInvitation(db, {
    id: crypto.randomUUID(),
    email: params.email,
    name: params.name,
    isAdmin: params.isAdmin,
    canTeach: params.canTeach,
    courseId: params.courseId,
    membershipRole: params.membershipRole,
    targetUserId: params.targetUserId ?? null,
    tokenHash: await sha256Hex(token),
    expiresAt: sqliteTimestamp(INVITATION_TTL_MS),
    invitedBy: params.invitedBy,
  });
  return token;
}
