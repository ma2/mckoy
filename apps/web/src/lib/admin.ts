import { api } from './api';

// 講座に紐付かない招待（管理者・講師資格の付与）。routes/admin-invitations.ts に対応する。
export const createGlobalInvitation = (params: { name: string; email: string; isAdmin: boolean; canTeach: boolean }) =>
  api.post<{ invitationUrl: string }>('/admin/invitations', params);

// 管理者によるユーザー一覧・パスキー手動復旧（仕様書 §7.1）。routes/admin-users.ts に対応する。

export type AdminUser = { id: string; name: string; email: string; isAdmin: boolean; canTeach: boolean };
export type AdminPasskey = { id: string; name: string | null; createdAt: string; lastUsedAt: string | null };

export const listUsers = () => api.get<{ users: AdminUser[] }>('/admin/users');

export const listUserPasskeys = (userId: string) =>
  api.get<{ passkeys: AdminPasskey[] }>(`/admin/users/${userId}/passkeys`);

export const deleteUserPasskey = (userId: string, passkeyId: string) =>
  api.delete<void>(`/admin/users/${userId}/passkeys/${passkeyId}`);
