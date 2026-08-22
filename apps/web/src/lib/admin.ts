import { api } from './api';

export const createGlobalInvitation = (params: { name: string; email: string; isAdmin: boolean; canTeach: boolean }) =>
  api.post<{ invitationUrl: string }>('/admin/invitations', params);
