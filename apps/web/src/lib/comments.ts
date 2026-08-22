import { api } from './api';

export type Comment = {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
};

export const listComments = (novelId: string) => api.get<{ comments: Comment[] }>(`/novels/${novelId}/comments`);

export const createComment = (novelId: string, body: string) =>
  api.post<void>(`/novels/${novelId}/comments`, { body });
