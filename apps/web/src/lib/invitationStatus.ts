// 招待（講座に紐付かないもの・講座紐付きの生徒招待、どちらも同じ形）の状態表示。
// AdminInvitations.tsx / CourseDetail.tsx で共通して使う。

export type InvitationStatus = '有効' | '使用済み' | '失効済み' | '期限切れ';

export function invitationStatus(inv: { usedAt: string | null; revokedAt: string | null; expiresAt: string }): InvitationStatus {
  if (inv.usedAt) return '使用済み';
  if (inv.revokedAt) return '失効済み';
  if (inv.expiresAt <= new Date().toISOString().slice(0, 19).replace('T', ' ')) return '期限切れ';
  return '有効';
}
