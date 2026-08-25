import { api } from './api';

// バックエンドの routes/courses.ts に対応するAPIクライアント。

export type MembershipRole = 'instructor' | 'student';
export type MembershipStatus = 'pending' | 'active' | 'rejected';
export type CourseStatus = 'open' | 'closed' | 'closed_readonly';

export type Course = {
  id: string;
  name: string;
  description: string | null;
  status: CourseStatus;
  createdBy: string;
  createdAt: string;
  /** 呼び出しユーザー自身のこの講座でのmembership（無ければnull）。一覧での参加申請ボタン出し分けに使う。 */
  myMembership: { role: MembershipRole; status: MembershipStatus } | null;
};

export type Member = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
};

export const roleLabel: Record<MembershipRole, string> = { instructor: '講師', student: '生徒' };
export const statusLabel: Record<MembershipStatus, string> = {
  pending: '承認待ち',
  active: '参加中',
  rejected: '拒否済み',
};

export const courseStatusLabel: Record<CourseStatus, string> = {
  open: 'オープン',
  closed: 'クローズ',
  closed_readonly: 'クローズ・閲覧のみ',
};

export const listCourses = () => api.get<{ courses: Course[] }>('/courses');

export const getCourse = (id: string) => api.get<{ course: Course }>(`/courses/${id}`);

export const createCourse = (params: { name: string; description: string | null }) =>
  api.post<{ course: Course }>('/courses', params);

export const updateCourse = (
  id: string,
  params: { name?: string; description?: string | null; status?: CourseStatus },
) => api.patch<{ course: Course }>(`/courses/${id}`, params);

export const joinCourse = (id: string) => api.post<void>(`/courses/${id}/join`);

export const listMembers = (courseId: string) => api.get<{ members: Member[] }>(`/courses/${courseId}/members`);

export const approveMember = (courseId: string, membershipId: string) =>
  api.post<void>(`/courses/${courseId}/members/${membershipId}/approve`);

export const rejectMember = (courseId: string, membershipId: string) =>
  api.post<void>(`/courses/${courseId}/members/${membershipId}/reject`);

export const createCourseInvitation = (courseId: string, params: { name: string; email: string }) =>
  api.post<{ invitationUrl: string }>(`/courses/${courseId}/invitations`, params);

export type CourseInvitation = {
  id: string;
  name: string;
  email: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export const listCourseInvitations = (courseId: string) =>
  api.get<{ invitations: CourseInvitation[] }>(`/courses/${courseId}/invitations`);

/** 招待を失効させる（仕様書 §5.4）。 */
export const revokeCourseInvitation = (courseId: string, invitationId: string) =>
  api.delete<void>(`/courses/${courseId}/invitations/${invitationId}`);

export const getMyMembership = (courseId: string) =>
  api.get<{ membership: { role: MembershipRole; status: MembershipStatus } | null }>(`/courses/${courseId}/membership`);
