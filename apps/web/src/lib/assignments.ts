import { api } from './api';

export type Assignment = {
  id: string;
  title: string;
  body: string;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
};

export const listAssignments = (courseId: string) => api.get<{ assignments: Assignment[] }>(`/courses/${courseId}/assignments`);

export const createAssignment = (courseId: string, params: { title: string; body: string; dueAt?: string | null }) =>
  api.post<void>(`/courses/${courseId}/assignments`, params);
