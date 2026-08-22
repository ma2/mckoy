import { api } from './api';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: string;
};

export const listAnnouncements = (courseId: string) =>
  api.get<{ announcements: Announcement[] }>(`/courses/${courseId}/announcements`);

export const createAnnouncement = (courseId: string, params: { title: string; body: string }) =>
  api.post<void>(`/courses/${courseId}/announcements`, params);
