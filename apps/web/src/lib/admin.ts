import { api } from './api';

// 講座に紐付かない招待（管理者・講師資格の付与）。routes/admin-invitations.ts に対応する。
export const createGlobalInvitation = (params: { name: string; email: string; isAdmin: boolean; canTeach: boolean }) =>
  api.post<{ invitationUrl: string }>('/admin/invitations', params);
