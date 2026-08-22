import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/types';
import { coursesRoute } from '../src/routes/courses';
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

async function seedCourseWithInstructor() {
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
  return { courseId, instructor };
}

for (const kind of ['assignments', 'announcements'] as const) {
  describe(kind, () => {
    it(`rejects a non-instructor from creating a ${kind === 'assignments' ? 'assignment' : 'announcement'}`, async () => {
      const app = buildApp();
      const { courseId } = await seedCourseWithInstructor();
      const outsider = await createTestUser();
      const cookie = await loginAs(app, outsider.id);

      const res = await app.request(`/courses/${courseId}/${kind}`, jsonRequest('POST', cookie, { title: 'T', body: 'B' }), env);
      expect(res.status).toBe(403);
    });

    it('rejects a user without active membership from viewing the list', async () => {
      const app = buildApp();
      const { courseId, instructor } = await seedCourseWithInstructor();
      const instructorCookie = await loginAs(app, instructor.id);
      await app.request(`/courses/${courseId}/${kind}`, jsonRequest('POST', instructorCookie, { title: 'T', body: 'B' }), env);

      const outsider = await createTestUser();
      const outsiderCookie = await loginAs(app, outsider.id);
      const res = await app.request(`/courses/${courseId}/${kind}`, { headers: { cookie: outsiderCookie } }, env);
      expect(res.status).toBe(403);
    });

    it('rejects a pending member from viewing the list', async () => {
      const app = buildApp();
      const { courseId, instructor } = await seedCourseWithInstructor();
      const instructorCookie = await loginAs(app, instructor.id);
      await app.request(`/courses/${courseId}/${kind}`, jsonRequest('POST', instructorCookie, { title: 'T', body: 'B' }), env);

      const pendingStudent = await createTestUser();
      await createMembership(env.DB, {
        id: crypto.randomUUID(),
        courseId,
        userId: pendingStudent.id,
        role: 'student',
        status: 'pending',
      });
      const pendingCookie = await loginAs(app, pendingStudent.id);
      const res = await app.request(`/courses/${courseId}/${kind}`, { headers: { cookie: pendingCookie } }, env);
      expect(res.status).toBe(403);
    });

    it('is visible to an active member after the instructor creates one', async () => {
      const app = buildApp();
      const { courseId, instructor } = await seedCourseWithInstructor();
      const instructorCookie = await loginAs(app, instructor.id);
      const createRes = await app.request(
        `/courses/${courseId}/${kind}`,
        jsonRequest('POST', instructorCookie, { title: 'Important', body: 'Read this' }),
        env,
      );
      expect(createRes.status).toBe(201);

      const student = await createTestUser();
      await createMembership(env.DB, {
        id: crypto.randomUUID(),
        courseId,
        userId: student.id,
        role: 'student',
        status: 'active',
      });
      const studentCookie = await loginAs(app, student.id);
      const listRes = await app.request(`/courses/${courseId}/${kind}`, { headers: { cookie: studentCookie } }, env);
      expect(listRes.status).toBe(200);
      const body = await listRes.json<Record<string, { title: string }[]>>();
      expect(body[kind]).toHaveLength(1);
      expect(body[kind]![0]!.title).toBe('Important');
    });
  });
}
