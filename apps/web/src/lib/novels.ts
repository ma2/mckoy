import { api } from './api';

// バックエンドの routes/novels.ts（詳細/編集/削除/改訂履歴）と
// routes/courses.ts（講座内の一覧/投稿）に対応するAPIクライアント。

export type NovelVisibility = 'instructors' | 'course_students' | 'all_users';

export type NovelSummary = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  visibility: NovelVisibility;
  tags: string[];
  createdAt: string;
};

export type Novel = {
  id: string;
  authorId: string;
  courseId: string;
  title: string;
  body: string;
  visibility: NovelVisibility;
  tags: string[];
  deletedAt: string | null;
  deletionComment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Revision = {
  id: string;
  title: string;
  body: string;
  revisionComment: string | null;
  createdBy: string;
  createdAt: string;
};

export const listNovels = (courseId: string) => api.get<{ novels: NovelSummary[] }>(`/courses/${courseId}/novels`);

export const createNovel = (
  courseId: string,
  params: { title: string; body: string; visibility?: NovelVisibility; tags?: string[] },
) => api.post<{ novel: Novel }>(`/courses/${courseId}/novels`, params);

export const getNovel = (id: string) => api.get<{ novel: Novel }>(`/novels/${id}`);

export const updateNovel = (
  id: string,
  params: { title?: string; body?: string; visibility?: NovelVisibility; tags?: string[]; revisionComment?: string },
) => api.patch<{ novel: Novel }>(`/novels/${id}`, params);

export const deleteNovel = (id: string, comment?: string) => api.delete<void>(`/novels/${id}`, comment ? { comment } : undefined);

export const listRevisions = (id: string) => api.get<{ revisions: Revision[] }>(`/novels/${id}/revisions`);
