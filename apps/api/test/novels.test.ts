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
import { listRevisionsByNovel } from '../src/db/novel_revisions';

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

/** A course with an active instructor and an active student. */
async function seedCourseWithStudent() {
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
  return { courseId, instructor, student };
}

async function postNovel(
  app: Hono<AppEnv>,
  cookie: string,
  courseId: string,
  overrides: { visibility?: string; title?: string } = {},
) {
  const res = await app.request(
    `/courses/${courseId}/novels`,
    jsonRequest('POST', cookie, {
      title: overrides.title ?? `Novel ${crypto.randomUUID()}`,
      body: 'once upon a time',
      visibility: overrides.visibility,
    }),
    env,
  );
  expect(res.status).toBe(201);
  const { novel } = await res.json<{ novel: { id: string } }>();
  return novel.id;
}

describe('novel creation', () => {
  it('rejects a user who is not an active student of the course', async () => {
    const app = buildApp();
    const { courseId, instructor } = await seedCourseWithStudent();
    const instructorCookie = await loginAs(app, instructor.id);

    const res = await app.request(
      `/courses/${courseId}/novels`,
      jsonRequest('POST', instructorCookie, { title: 'T', body: 'B' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('rejects a pending student', async () => {
    const app = buildApp();
    const { courseId } = await seedCourseWithStudent();
    const pendingStudent = await createTestUser();
    await createMembership(env.DB, {
      id: crypto.randomUUID(),
      courseId,
      userId: pendingStudent.id,
      role: 'student',
      status: 'pending',
    });
    const cookie = await loginAs(app, pendingStudent.id);

    const res = await app.request(
      `/courses/${courseId}/novels`,
      jsonRequest('POST', cookie, { title: 'T', body: 'B' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('rejects a student of a different course', async () => {
    const app = buildApp();
    const { courseId } = await seedCourseWithStudent();
    const { student: otherStudent } = await seedCourseWithStudent();
    const cookie = await loginAs(app, otherStudent.id);

    const res = await app.request(
      `/courses/${courseId}/novels`,
      jsonRequest('POST', cookie, { title: 'T', body: 'B' }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('edit and delete authorization', () => {
  it('rejects an edit from someone other than the author', async () => {
    const app = buildApp();
    const { courseId, student, instructor } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId);

    const instructorCookie = await loginAs(app, instructor.id);
    const res = await app.request(
      `/novels/${novelId}`,
      jsonRequest('PATCH', instructorCookie, { title: 'hijacked' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('rejects a delete from someone who is neither the author nor an admin', async () => {
    const app = buildApp();
    const { courseId, student, instructor } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId, { visibility: 'course_students' });

    const instructorCookie = await loginAs(app, instructor.id);
    const res = await app.request(`/novels/${novelId}`, { method: 'DELETE', headers: { cookie: instructorCookie } }, env);
    expect(res.status).toBe(403);
  });

  it('allows an admin to delete someone else\'s novel', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId, { visibility: 'all_users' });

    const admin = await createTestUser({ isAdmin: true });
    const adminCookie = await loginAs(app, admin.id);
    const res = await app.request(`/novels/${novelId}`, { method: 'DELETE', headers: { cookie: adminCookie } }, env);
    expect(res.status).toBe(204);

    // Even the author can no longer see it once deleted.
    const authorRes = await app.request(`/novels/${novelId}`, { headers: { cookie: studentCookie } }, env);
    expect(authorRes.status).toBe(404);

    // But an admin still can.
    const adminRes = await app.request(`/novels/${novelId}`, { headers: { cookie: adminCookie } }, env);
    expect(adminRes.status).toBe(200);
  });
});

describe('visibility', () => {
  it('instructors visibility: viewable by the author and an active instructor, not by an active student', async () => {
    const app = buildApp();
    const { courseId, student, instructor } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId, { visibility: 'instructors' });

    const authorRes = await app.request(`/novels/${novelId}`, { headers: { cookie: studentCookie } }, env);
    expect(authorRes.status).toBe(200);

    const instructorCookie = await loginAs(app, instructor.id);
    const instructorRes = await app.request(`/novels/${novelId}`, { headers: { cookie: instructorCookie } }, env);
    expect(instructorRes.status).toBe(200);

    const otherStudent = await createTestUser();
    await createMembership(env.DB, {
      id: crypto.randomUUID(),
      courseId,
      userId: otherStudent.id,
      role: 'student',
      status: 'active',
    });
    const otherStudentCookie = await loginAs(app, otherStudent.id);
    const otherRes = await app.request(`/novels/${novelId}`, { headers: { cookie: otherStudentCookie } }, env);
    expect(otherRes.status).toBe(404);
  });

  it('course_students visibility: viewable by any active member, not by an outsider', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId, { visibility: 'course_students' });

    const outsider = await createTestUser();
    const outsiderCookie = await loginAs(app, outsider.id);
    const outsiderRes = await app.request(`/novels/${novelId}`, { headers: { cookie: outsiderCookie } }, env);
    expect(outsiderRes.status).toBe(404);

    const otherStudent = await createTestUser();
    await createMembership(env.DB, {
      id: crypto.randomUUID(),
      courseId,
      userId: otherStudent.id,
      role: 'student',
      status: 'active',
    });
    const otherStudentCookie = await loginAs(app, otherStudent.id);
    const memberRes = await app.request(`/novels/${novelId}`, { headers: { cookie: otherStudentCookie } }, env);
    expect(memberRes.status).toBe(200);
  });

  it('all_users visibility: viewable by a totally unrelated logged-in user', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId, { visibility: 'all_users' });

    const stranger = await createTestUser();
    const strangerCookie = await loginAs(app, stranger.id);
    const res = await app.request(`/novels/${novelId}`, { headers: { cookie: strangerCookie } }, env);
    expect(res.status).toBe(200);
  });

  it('a pending membership in the course grants no visibility at all', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId, { visibility: 'course_students' });

    const pendingStudent = await createTestUser();
    await createMembership(env.DB, {
      id: crypto.randomUUID(),
      courseId,
      userId: pendingStudent.id,
      role: 'student',
      status: 'pending',
    });
    const pendingCookie = await loginAs(app, pendingStudent.id);
    const res = await app.request(`/novels/${novelId}`, { headers: { cookie: pendingCookie } }, env);
    expect(res.status).toBe(404);
  });

  it('an instructor of a different course cannot view instructors/course_students novels', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const { instructor: otherInstructor } = await seedCourseWithStudent();

    const studentCookie = await loginAs(app, student.id);
    const instructorsNovelId = await postNovel(app, studentCookie, courseId, { visibility: 'instructors' });
    const studentsNovelId = await postNovel(app, studentCookie, courseId, { visibility: 'course_students' });

    const otherInstructorCookie = await loginAs(app, otherInstructor.id);
    const res1 = await app.request(`/novels/${instructorsNovelId}`, { headers: { cookie: otherInstructorCookie } }, env);
    expect(res1.status).toBe(404);
    const res2 = await app.request(`/novels/${studentsNovelId}`, { headers: { cookie: otherInstructorCookie } }, env);
    expect(res2.status).toBe(404);
  });
});

describe('revisions', () => {
  it('records a new revision on every edit, matching the latest content', async () => {
    const app = buildApp();
    const { courseId, student } = await seedCourseWithStudent();
    const studentCookie = await loginAs(app, student.id);
    const novelId = await postNovel(app, studentCookie, courseId, { title: 'Original title' });

    let revisions = await listRevisionsByNovel(env.DB, novelId);
    expect(revisions).toHaveLength(1);

    const res = await app.request(
      `/novels/${novelId}`,
      jsonRequest('PATCH', studentCookie, { title: 'Revised title', body: 'revised body' }),
      env,
    );
    expect(res.status).toBe(200);

    revisions = await listRevisionsByNovel(env.DB, novelId);
    expect(revisions).toHaveLength(2);
    expect(revisions[0]!.title).toBe('Revised title');
    expect(revisions[0]!.body).toBe('revised body');
  });
});
