// 小説へのコメント投稿権限（対象講座のactive講師/管理者のみ）と、
// コメント閲覧が小説自体のvisibilityに従うことのテスト。
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/types';
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
  app.route('/courses', coursesRoute);
  app.route('/novels', novelsRoute);
  return app;
}

async function createTestUser(overrides: { isAdmin?: boolean } = {}) {
  return createUser(env.DB, {
    id: crypto.randomUUID(),
    name: 'Test User',
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

/** A course with an active instructor and an active student, and one novel by that student. */
async function seedCourseWithNovel(visibility = 'course_students') {
  const app = buildApp();
  const instructor = await createTestUser();
  const courseId = crypto.randomUUID();
  await createCourse(env.DB, {
    id: courseId,
    name: `Course ${crypto.randomUUID()}`,
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
  const student = await createTestUser();
  await createMembership(env.DB, {
    id: crypto.randomUUID(),
    courseId,
    userId: student.id,
    role: 'student',
    status: 'active',
  });

  const studentCookie = await loginAs(app, student.id);
  const res = await app.request(
    `/courses/${courseId}/novels`,
    jsonRequest('POST', studentCookie, { title: 'A novel', body: 'once upon a time', visibility }),
    env,
  );
  const { novel } = await res.json<{ novel: { id: string } }>();

  return { app, courseId, instructor, student, novelId: novel.id };
}

describe('comment posting authorization', () => {
  it('rejects a student (even the novel author) from posting a comment', async () => {
    const { app, student, novelId } = await seedCourseWithNovel();
    const cookie = await loginAs(app, student.id);
    const res = await app.request(`/novels/${novelId}/comments`, jsonRequest('POST', cookie, { body: 'hi' }), env);
    expect(res.status).toBe(403);
  });

  it('rejects an instructor of a different course, even when the novel is publicly visible', async () => {
    // visibility=all_usersにして、別講座の講師からも小説自体は見える状態にする
    // ことで、「コメント投稿権限」のチェックを「小説の可視性」チェックと切り分けて検証する。
    const { app, novelId } = await seedCourseWithNovel('all_users');
    const otherInstructor = await createTestUser();
    const otherCourseId = crypto.randomUUID();
    await createCourse(env.DB, {
      id: otherCourseId,
      name: `Course ${crypto.randomUUID()}`,
      description: null,
      createdBy: otherInstructor.id,
    });
    await createMembership(env.DB, {
      id: crypto.randomUUID(),
      courseId: otherCourseId,
      userId: otherInstructor.id,
      role: 'instructor',
      status: 'active',
    });
    const cookie = await loginAs(app, otherInstructor.id);
    const res = await app.request(`/novels/${novelId}/comments`, jsonRequest('POST', cookie, { body: 'hi' }), env);
    expect(res.status).toBe(403);
  });

  it('allows the course instructor to comment, and it shows up in the list', async () => {
    const { app, instructor, novelId } = await seedCourseWithNovel();
    const cookie = await loginAs(app, instructor.id);
    const postRes = await app.request(
      `/novels/${novelId}/comments`,
      jsonRequest('POST', cookie, { body: 'great start!' }),
      env,
    );
    expect(postRes.status).toBe(201);

    const listRes = await app.request(`/novels/${novelId}/comments`, { headers: { cookie } }, env);
    const { comments } = await listRes.json<{ comments: { body: string }[] }>();
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toBe('great start!');
  });

  it('allows an admin to comment', async () => {
    const { app, novelId } = await seedCourseWithNovel();
    const admin = await createTestUser({ isAdmin: true });
    const cookie = await loginAs(app, admin.id);
    const res = await app.request(`/novels/${novelId}/comments`, jsonRequest('POST', cookie, { body: 'noted' }), env);
    expect(res.status).toBe(201);
  });

  it('a user who cannot see the novel cannot see its comments either', async () => {
    const { app, instructor, novelId } = await seedCourseWithNovel('instructors');
    const instructorCookie = await loginAs(app, instructor.id);
    await app.request(`/novels/${novelId}/comments`, jsonRequest('POST', instructorCookie, { body: 'private note' }), env);

    const outsider = await createTestUser();
    const outsiderCookie = await loginAs(app, outsider.id);
    const res = await app.request(`/novels/${novelId}/comments`, { headers: { cookie: outsiderCookie } }, env);
    expect(res.status).toBe(404);
  });
});
