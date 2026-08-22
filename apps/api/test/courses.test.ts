// 講座の作成・編集・参加申請・承認/拒否まわりの認可テスト。特に「別講座の講師は
// 他講座のmembershipを操作できない」ことの検証を重視している（CLAUDE.md参照）。
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { AppEnv } from '../src/types';
import { coursesRoute } from '../src/routes/courses';
import { issueSession } from '../src/auth/session';
import { createUser } from '../src/db/users';
import { createCourse } from '../src/db/courses';
import { createMembership, getMembershipByCourseAndUser } from '../src/db/course_memberships';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.post('/login-as/:userId', async (c) => {
    await issueSession(c, c.req.param('userId'));
    return c.body(null, 204);
  });
  app.route('/courses', coursesRoute);
  return app;
}

async function createTestUser(overrides: { isAdmin?: boolean; canTeach?: boolean } = {}) {
  return createUser(env.DB, {
    id: crypto.randomUUID(),
    name: 'Test User',
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

/** A course with its creator already active as its instructor. */
async function seedCourse() {
  const owner = await createTestUser({ canTeach: true });
  const id = crypto.randomUUID();
  await createCourse(env.DB, { id, name: `Course ${crypto.randomUUID()}`, description: null, createdBy: owner.id });
  await createMembership(env.DB, {
    id: crypto.randomUUID(),
    courseId: id,
    userId: owner.id,
    role: 'instructor',
    status: 'active',
  });
  return { id, owner };
}

function jsonRequest(method: string, cookie: string, body: unknown) {
  return { method, headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

describe('course creation', () => {
  it('rejects a user with neither can_teach nor admin', async () => {
    const app = buildApp();
    const user = await createTestUser();
    const cookie = await loginAs(app, user.id);

    const res = await app.request('/courses', jsonRequest('POST', cookie, { name: `Course ${crypto.randomUUID()}` }), env);
    expect(res.status).toBe(403);
  });

  it('makes the creator an active instructor of the new course', async () => {
    const app = buildApp();
    const user = await createTestUser({ canTeach: true });
    const cookie = await loginAs(app, user.id);

    const res = await app.request('/courses', jsonRequest('POST', cookie, { name: `Course ${crypto.randomUUID()}` }), env);
    expect(res.status).toBe(201);
    const body = await res.json<{ course: { id: string } }>();

    const membership = await getMembershipByCourseAndUser(env.DB, body.course.id, user.id);
    expect(membership?.role).toBe('instructor');
    expect(membership?.status).toBe('active');
  });
});

describe('course editing authorization', () => {
  it('rejects an edit from a user who is not an active instructor of that course', async () => {
    const app = buildApp();
    const { id: courseId } = await seedCourse();
    const outsider = await createTestUser();
    const cookie = await loginAs(app, outsider.id);

    const res = await app.request(`/courses/${courseId}`, jsonRequest('PATCH', cookie, { description: 'hijacked' }), env);
    expect(res.status).toBe(403);
  });

  it('allows an admin to edit any course', async () => {
    const app = buildApp();
    const { id: courseId } = await seedCourse();
    const admin = await createTestUser({ isAdmin: true });
    const cookie = await loginAs(app, admin.id);

    const res = await app.request(`/courses/${courseId}`, jsonRequest('PATCH', cookie, { description: 'updated' }), env);
    expect(res.status).toBe(200);
    const body = await res.json<{ course: { description: string | null } }>();
    expect(body.course.description).toBe('updated');
  });
});

describe('membership approval authorization', () => {
  it('rejects approval from an instructor of a different course', async () => {
    const app = buildApp();
    const { id: courseAId } = await seedCourse();
    const { owner: courseBOwner } = await seedCourse();

    const student = await createTestUser();
    await createMembership(env.DB, {
      id: crypto.randomUUID(),
      courseId: courseAId,
      userId: student.id,
      role: 'student',
      status: 'pending',
    });
    const pending = await getMembershipByCourseAndUser(env.DB, courseAId, student.id);

    const cookie = await loginAs(app, courseBOwner.id);
    const res = await app.request(
      `/courses/${courseAId}/members/${pending!.id}/approve`,
      { method: 'POST', headers: { cookie } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it('rejects approving a membership that belongs to a different course than the URL names', async () => {
    const app = buildApp();
    const { id: courseAId } = await seedCourse();
    const { id: courseBId, owner: courseBOwner } = await seedCourse();

    const student = await createTestUser();
    await createMembership(env.DB, {
      id: crypto.randomUUID(),
      courseId: courseAId,
      userId: student.id,
      role: 'student',
      status: 'pending',
    });
    const pending = await getMembershipByCourseAndUser(env.DB, courseAId, student.id);

    // courseBOwnerは講座Bの正当なactive講師だが、対象のmembership idは講座Aのもの
    // ——このケースは拒否されなければならない。
    const cookie = await loginAs(app, courseBOwner.id);
    const res = await app.request(
      `/courses/${courseBId}/members/${pending!.id}/approve`,
      { method: 'POST', headers: { cookie } },
      env,
    );
    expect(res.status).toBe(404);

    const unchanged = await getMembershipByCourseAndUser(env.DB, courseAId, student.id);
    expect(unchanged!.status).toBe('pending');
  });
});

describe('join requests', () => {
  it('creates a pending membership, then activates it on instructor approval', async () => {
    const app = buildApp();
    const { id: courseId, owner } = await seedCourse();
    const student = await createTestUser();
    const studentCookie = await loginAs(app, student.id);

    const joinRes = await app.request(`/courses/${courseId}/join`, { method: 'POST', headers: { cookie: studentCookie } }, env);
    expect(joinRes.status).toBe(201);

    const pending = await getMembershipByCourseAndUser(env.DB, courseId, student.id);
    expect(pending?.status).toBe('pending');

    const instructorCookie = await loginAs(app, owner.id);
    const approveRes = await app.request(
      `/courses/${courseId}/members/${pending!.id}/approve`,
      { method: 'POST', headers: { cookie: instructorCookie } },
      env,
    );
    expect(approveRes.status).toBe(200);

    const active = await getMembershipByCourseAndUser(env.DB, courseId, student.id);
    expect(active?.status).toBe('active');
  });

  it('rejects a duplicate join request for the same course', async () => {
    const app = buildApp();
    const { id: courseId } = await seedCourse();
    const student = await createTestUser();
    const cookie = await loginAs(app, student.id);

    const first = await app.request(`/courses/${courseId}/join`, { method: 'POST', headers: { cookie } }, env);
    expect(first.status).toBe(201);

    const second = await app.request(`/courses/${courseId}/join`, { method: 'POST', headers: { cookie } }, env);
    expect(second.status).toBe(409);
  });
});
