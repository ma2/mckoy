// 管理者による削除済み小説の確認（仕様書 §12、issue #45）のテスト。
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/types';
import { adminNovelsRoute } from '../src/routes/admin-novels';
import { coursesRoute } from '../src/routes/courses';
import { novelsRoute } from '../src/routes/novels';
import { issueSession } from '../src/auth/session';
import { createUser } from '../src/db/users';
import { createCourse } from '../src/db/courses';
import { createMembership } from '../src/db/course_memberships';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.post('/login-as/:userId', async (c) => {
    await issueSession(c, c.req.param('userId'));
    return c.body(null, 204);
  });
  app.route('/admin/novels', adminNovelsRoute);
  app.route('/courses', coursesRoute);
  app.route('/novels', novelsRoute);
  return app;
}

async function createTestUser(overrides: { isAdmin?: boolean; name?: string } = {}) {
  return createUser(env.DB, {
    id: crypto.randomUUID(),
    name: overrides.name ?? 'Test User',
    email: `user-${crypto.randomUUID()}@example.com`,
    isAdmin: overrides.isAdmin ?? false,
    canTeach: false,
  });
}

async function loginAs(app: Hono<AppEnv>, userId: string): Promise<string> {
  const res = await app.request(`/login-as/${userId}`, { method: 'POST' }, env);
  const cookie = res.headers.get('set-cookie');
  if (!cookie) throw new Error('login failed: no session cookie issued');
  return cookie.split(';')[0]!;
}

function jsonRequest(method: string, cookie: string, body: unknown) {
  return { method, headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

/** A course with an active instructor and an active student. */
async function seedCourseWithStudent(courseName?: string) {
  const instructor = await createTestUser();
  const courseId = crypto.randomUUID();
  await createCourse(env.DB, {
    id: courseId,
    name: courseName ?? `Course ${crypto.randomUUID()}`,
    description: null,
    createdBy: instructor.id,
  });
  await createMembership(env.DB, {
    id: crypto.randomUUID(),
    courseId,
    userId: instructor.id,
    role: 'instructor',
    status: 'active',
  });
  const student = await createTestUser({ name: 'Deleted Novel Author' });
  await createMembership(env.DB, {
    id: crypto.randomUUID(),
    courseId,
    userId: student.id,
    role: 'student',
    status: 'active',
  });
  return { courseId, instructor, student };
}

async function postNovel(app: Hono<AppEnv>, cookie: string, courseId: string, title: string) {
  const res = await app.request(
    `/courses/${courseId}/novels`,
    jsonRequest('POST', cookie, { title, body: 'once upon a time' }),
    env,
  );
  const { novel } = await res.json<{ novel: { id: string } }>();
  return novel.id;
}

describe('GET /admin/novels/deleted (issue #45)', () => {
  it('rejects a non-admin', async () => {
    const app = buildApp();
    const user = await createTestUser();
    const cookie = await loginAs(app, user.id);
    const res = await app.request('/admin/novels/deleted', { headers: { cookie } }, env);
    expect(res.status).toBe(403);
  });

  it('does not include novels that have not been deleted', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    await postNovel(app, studentCookie, courseId, 'Still alive');

    const cookie = await loginAs(app, admin.id);
    const res = await app.request('/admin/novels/deleted', { headers: { cookie } }, env);
    const { novels } = await res.json<{ novels: unknown[] }>();
    expect(novels).toHaveLength(0);
  });

  it('lists a deleted novel with author, course, and deleter info', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true, name: 'Admin Deleter' });
    const { courseId, student } = await seedCourseWithStudent('Deleted Novel Course');
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId, 'Removed Novel');

    const adminCookie = await loginAs(app, admin.id);
    const deleteRes = await app.request(
      `/novels/${novelId}`,
      jsonRequest('DELETE', adminCookie, { comment: 'モデレーションのため削除' }),
      env,
    );
    expect(deleteRes.status).toBe(204);

    const res = await app.request('/admin/novels/deleted', { headers: { cookie: adminCookie } }, env);
    expect(res.status).toBe(200);
    const { novels } = await res.json<{
      novels: {
        id: string;
        title: string;
        authorName: string;
        courseName: string;
        deletedByName: string | null;
        deletionComment: string | null;
        deletedAt: string;
      }[];
    }>();
    expect(novels).toHaveLength(1);
    expect(novels[0]!.id).toBe(novelId);
    expect(novels[0]!.title).toBe('Removed Novel');
    expect(novels[0]!.authorName).toBe('Deleted Novel Author');
    expect(novels[0]!.courseName).toBe('Deleted Novel Course');
    expect(novels[0]!.deletedByName).toBe('Admin Deleter');
    expect(novels[0]!.deletionComment).toBe('モデレーションのため削除');
    expect(novels[0]!.deletedAt).toBeTruthy();
  });
});
