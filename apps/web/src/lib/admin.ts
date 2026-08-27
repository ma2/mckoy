import { api } from './api';

// 講座に紐付かない招待（管理者・講師資格の付与）。routes/admin-invitations.ts に対応する。
export const createGlobalInvitation = (params: { name: string; email: string; isAdmin: boolean; canTeach: boolean }) =>
  api.post<{ invitationUrl: string }>('/admin/invitations', params);

export type GlobalInvitation = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  canTeach: boolean;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export const listGlobalInvitations = () => api.get<{ invitations: GlobalInvitation[] }>('/admin/invitations');

/** 招待を失効させる（仕様書 §5.4）。 */
export const revokeGlobalInvitation = (id: string) => api.delete<void>(`/admin/invitations/${id}`);

// 管理者によるユーザー一覧・パスキー手動復旧（仕様書 §7.1）。routes/admin-users.ts に対応する。

export type AdminUser = { id: string; name: string; email: string; isAdmin: boolean; canTeach: boolean };
export type AdminPasskey = { id: string; name: string | null; createdAt: string; lastUsedAt: string | null };

export const listUsers = () => api.get<{ users: AdminUser[] }>('/admin/users');

/**
 * 既存ユーザーの権限フラグを更新する（issue #43）。can_teach は付与・はく奪どちらも
 * 可能。is_admin は付与のみで、はく奪（false）はサーバー側で拒否される
 * （管理者権限のはく奪は運用スクリプト `npm run revoke:admin` でのみ行う）。
 */
export const updateUser = (userId: string, params: { isAdmin?: boolean; canTeach?: boolean }) =>
  api.patch<{ user: AdminUser }>(`/admin/users/${userId}`, params);

export const listUserPasskeys = (userId: string) =>
  api.get<{ passkeys: AdminPasskey[] }>(`/admin/users/${userId}/passkeys`);

export const deleteUserPasskey = (userId: string, passkeyId: string) =>
  api.delete<void>(`/admin/users/${userId}/passkeys/${passkeyId}`);

/** 既存ユーザーへのパスキー再登録用招待URLを発行する（仕様書 §7.1 手動復旧フロー手順4）。 */
export const createPasskeyResetInvitation = (userId: string) =>
  api.post<{ invitationUrl: string }>(`/admin/users/${userId}/passkey-reset-invitation`);

// 管理者による削除済み小説の確認（仕様書 §12）。routes/admin-novels.ts に対応する。

export type DeletedNovel = {
  id: string;
  title: string;
  authorName: string;
  courseId: string;
  courseName: string;
  deletedAt: string;
  deletedByName: string | null;
  deletionComment: string | null;
};

export const listDeletedNovels = () => api.get<{ novels: DeletedNovel[] }>('/admin/novels/deleted');
