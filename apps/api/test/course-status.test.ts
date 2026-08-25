// 講座の状態（オープン/クローズ/クローズ・閲覧のみ）による生徒アクセス制御のテスト（issue #17）。
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/types';
import { coursesRoute } from '../src/routes/courses';
import { novelsRoute } from '../src/routes/novels';
import { issueSession } from '../src/auth/session';
import { createUser } from '../src/db/users';
import { createCourse, getCourseById, updateCourse } from '../src/db/courses';
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

async function createTestUser(overrides: { isAdmin?: boolean; canTeach?: boolean; name?: string } = {}) {
  return createUser(env.DB, {
    id: crypto.randomUUID(),
    name: overrides.name ?? 'Test User',
    email: `user-${crypto.randomUUID()}@example.com`,
    isAdmin: overrides.isAdmin ?? false,
    canTeach: overrides.canTeach ?? false,
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
async function seedCourseWithStudent() {
  const instructor = await createTestUser();
  const courseId = crypto.randomUUID();
  await createCourse(env.DB, { id: courseId, name: `Course ${crypto.randomUUID()}`, description: null, createdBy: instructor.id });
  await createMembership(env.DB, { id: crypto.randomUUID(), courseId, userId: instructor.id, role: 'instructor', status: 'active' });
  const student = await createTestUser();
  await createMembership(env.DB, { id: crypto.randomUUID(), courseId, userId: student.id, role: 'student', status: 'active' });
  return { courseId, instructor, student };
}

async function postNovel(app: Hono<AppEnv>, cookie: string, courseId: string) {
  const res = await app.request(
    `/courses/${courseId}/novels`,
    jsonRequest('POST', cookie, { title: `Novel ${crypto.randomUUID()}`, body: 'once upon a time', visibility: 'course_students' }),
    env,
  );
  expect(res.status).toBe(201);
  const { novel } = await res.json<{ novel: { id: string } }>();
  return novel.id;
}

describe('new course defaults to open (issue #17)', () => {
  it('creates a course with status "open"', async () => {
    const app = buildApp();
    const owner = await createTestUser({ canTeach: true });
    const cookie = await loginAs(app, owner.id);
    const res = await app.request('/courses', jsonRequest('POST', cookie, { name: `Course ${crypto.randomUUID()}` }), env);
    const { course } = await res.json<{ course: { status: string } }>();
    expect(course.status).toBe('open');
  });
});

describe('PATCH /courses/:id status validation and authorization', () => {
  it('rejects an invalid status value', async () => {
    const app = buildApp();
    const { courseId, instructor } = await seedCourseWithStudent();
    const cookie = await loginAs(app, instructor.id);
    const res = await app.request(`/courses/${courseId}`, jsonRequest('PATCH', cookie, { status: 'archived' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects a student from changing the course status', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const cookie = await loginAs(app, student.id);
    const res = await app.request(`/courses/${courseId}`, jsonRequest('PATCH', cookie, { status: 'closed' }), env);
    expect(res.status).toBe(403);
  });

  it('rejects an instructor of a different course from changing the status', async () => {
    const app = buildApp();
    const { courseId } = await seedCourseWithStudent();
    const { instructor: otherInstructor } = await seedCourseWithStudent();
    const cookie = await loginAs(app, otherInstructor.id);
    const res = await app.request(`/courses/${courseId}`, jsonRequest('PATCH', cookie, { status: 'closed' }), env);
    expect(res.status).toBe(403);
    expect((await getCourseById(env.DB, courseId))!.status).toBe('open');
  });

  it('lets the course instructor change the status', async () => {
    const app = buildApp();
    const { courseId, instructor } = await seedCourseWithStudent();
    const cookie = await loginAs(app, instructor.id);
    const res = await app.request(`/courses/${courseId}`, jsonRequest('PATCH', cookie, { status: 'closed_readonly' }), env);
    expect(res.status).toBe(200);
    expect((await getCourseById(env.DB, courseId))!.status).toBe('closed_readonly');
  });
});

describe('closed course: students see only the course name and announcements (issue #17)', () => {
  it('blocks a student from listing novels', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    await updateCourse(env.DB, courseId, { status: 'closed' });
    const cookie = await loginAs(app, student.id);
    const res = await app.request(`/courses/${courseId}/novels`, { headers: { cookie } }, env);
    expect(res.status).toBe(403);
  });

  it('still lets the instructor list novels', async () => {
    const app = buildApp();
    const { courseId, instructor } = await seedCourseWithStudent();
    await updateCourse(env.DB, courseId, { status: 'closed' });
    const cookie = await loginAs(app, instructor.id);
    const res = await app.request(`/courses/${courseId}/novels`, { headers: { cookie } }, env);
    expect(res.status).toBe(200);
  });

  it('hides even the author\'s own novel from GET /novels/:id once the course is closed', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId);
    await updateCourse(env.DB, courseId, { status: 'closed' });

    const res = await app.request(`/novels/${novelId}`, { headers: { cookie: studentCookie } }, env);
    expect(res.status).toBe(404);
  });

  it('blocks posting a new novel', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    await updateCourse(env.DB, courseId, { status: 'closed' });
    const cookie = await loginAs(app, student.id);
    const res = await app.request(
      `/courses/${courseId}/novels`,
      jsonRequest('POST', cookie, { title: 'New', body: 'B' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('blocks a student from listing assignments, but announcements remain visible', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    await updateCourse(env.DB, courseId, { status: 'closed' });
    const cookie = await loginAs(app, student.id);

    const assignmentsRes = await app.request(`/courses/${courseId}/assignments`, { headers: { cookie } }, env);
    expect(assignmentsRes.status).toBe(403);

    const announcementsRes = await app.request(`/courses/${courseId}/announcements`, { headers: { cookie } }, env);
    expect(announcementsRes.status).toBe(200);
  });

  it('blocks a new join request', async () => {
    const app = buildApp();
    const { courseId } = await seedCourseWithStudent();
    await updateCourse(env.DB, courseId, { status: 'closed' });
    const outsider = await createTestUser();
    const cookie = await loginAs(app, outsider.id);
    const res = await app.request(`/courses/${courseId}/join`, { method: 'POST', headers: { cookie } }, env);
    expect(res.status).toBe(403);
  });
});

describe('closed_readonly course: viewing stays available, writing is blocked (issue #17)', () => {
  it('still lets a student view the novel list, an individual novel, and assignments', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId);
    await updateCourse(env.DB, courseId, { status: 'closed_readonly' });

    const listRes = await app.request(`/courses/${courseId}/novels`, { headers: { cookie: studentCookie } }, env);
    expect(listRes.status).toBe(200);

    const novelRes = await app.request(`/novels/${novelId}`, { headers: { cookie: studentCookie } }, env);
    expect(novelRes.status).toBe(200);

    const assignmentsRes = await app.request(`/courses/${courseId}/assignments`, { headers: { cookie: studentCookie } }, env);
    expect(assignmentsRes.status).toBe(200);
  });

  it('blocks posting a new novel', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    await updateCourse(env.DB, courseId, { status: 'closed_readonly' });
    const cookie = await loginAs(app, student.id);
    const res = await app.request(
      `/courses/${courseId}/novels`,
      jsonRequest('POST', cookie, { title: 'New', body: 'B' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('blocks the author from editing their existing novel', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId);
    await updateCourse(env.DB, courseId, { status: 'closed_readonly' });

    const res = await app.request(`/novels/${novelId}`, jsonRequest('PATCH', studentCookie, { title: 'Edited' }), env);
    expect(res.status).toBe(403);
  });

  it('blocks the author from deleting their existing novel, but an admin can still delete it', async () => {
    const app = buildApp();
    const admin = await createTestUser({ isAdmin: true });
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId);
    await updateCourse(env.DB, courseId, { status: 'closed_readonly' });

    const authorDeleteRes = await app.request(`/novels/${novelId}`, { method: 'DELETE', headers: { cookie: studentCookie } }, env);
    expect(authorDeleteRes.status).toBe(403);

    const adminCookie = await loginAs(app, admin.id);
    const adminDeleteRes = await app.request(`/novels/${novelId}`, { method: 'DELETE', headers: { cookie: adminCookie } }, env);
    expect(adminDeleteRes.status).toBe(204);
  });

  it('blocks a new join request', async () => {
    const app = buildApp();
    const { courseId } = await seedCourseWithStudent();
    await updateCourse(env.DB, courseId, { status: 'closed_readonly' });
    const outsider = await createTestUser();
    const cookie = await loginAs(app, outsider.id);
    const res = await app.request(`/courses/${courseId}/join`, { method: 'POST', headers: { cookie } }, env);
    expect(res.status).toBe(403);
  });
});
