import { api } from './api';

export type Course = {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
};

export type MembershipRole = 'instructor' | 'student';
export type MembershipStatus = 'pending' | 'active' | 'rejected';

export type Member = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
};

export const listCourses = () => api.get<{ courses: Course[] }>('/courses');

export const getCourse = (id: string) => api.get<{ course: Course }>(`/courses/${id}`);

export const createCourse = (params: { name: string; description: string | null }) =>
  api.post<{ course: Course }>('/courses', params);

export const updateCourse = (id: string, params: { name?: string; description?: string | null }) =>
  api.patch<{ course: Course }>(`/courses/${id}`, params);

export const joinCourse = (id: string) => api.post<void>(`/courses/${id}/join`);

export const listMembers = (courseId: string) => api.get<{ members: Member[] }>(`/courses/${courseId}/members`);

export const approveMember = (courseId: string, membershipId: string) =>
  api.post<void>(`/courses/${courseId}/members/${membershipId}/approve`);

export const rejectMember = (courseId: string, membershipId: string) =>
  api.post<void>(`/courses/${courseId}/members/${membershipId}/reject`);

export const createCourseInvitation = (courseId: string, params: { name: string; email: string }) =>
  api.post<{ invitationUrl: string }>(`/courses/${courseId}/invitations`, params);
