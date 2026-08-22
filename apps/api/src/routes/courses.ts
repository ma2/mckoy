import { Hono, type Context } from 'hono';
import type { AppEnv } from '../types';
import { requireSession } from '../auth/session';
import { issueInvitation } from '../auth/invitation';
import { createCourse, getCourseById, listCourses, updateCourse } from '../db/courses';
import {
  createMembership,
  getMembershipByCourseAndUser,
  getMembershipById,
  isActiveInstructor,
  listMembershipsByCourse,
  updateMembershipStatus,
} from '../db/course_memberships';
import { createNovel, getNovelById, listNovelsByCourse, type NovelVisibility } from '../db/novels';
import { createRevision } from '../db/novel_revisions';
import { findOrCreateTagIds, setNovelTags, listTagsByNovel } from '../db/tags';
import { createAssignment, listAssignmentsByCourse } from '../db/assignments';
import { createAnnouncement, listAnnouncementsByCourse } from '../db/announcements';

export const coursesRoute = new Hono<AppEnv>();

coursesRoute.use('*', requireSession);

async function canManageCourse(db: D1Database, user: { isAdmin: boolean; id: string }, courseId: string) {
  return user.isAdmin || isActiveInstructor(db, courseId, user.id);
}

/**
 * Assignments and announcements are course-internal content: MCKOY_SPEC.md §15
 * states this explicitly for announcements ("only users with an active
 * membership in the course may view them; admins may view/edit all"), and we
 * apply the same rule to assignments for consistency, since the spec doesn't
 * otherwise restrict who can see them and the app has no public content.
 */
async function hasActiveMembership(db: D1Database, user: { isAdmin: boolean; id: string }, courseId: string) {
  if (user.isAdmin) return true;
  const membership = await getMembershipByCourseAndUser(db, courseId, user.id);
  return membership !== null && membership.status === 'active';
}

coursesRoute.get('/', async (c) => {
  const courses = await listCourses(c.env.DB);
  return c.json({
    courses: courses.map((course) => ({
      id: course.id,
      name: course.name,
      description: course.description,
      createdBy: course.created_by,
      createdAt: course.created_at,
    })),
  });
});

coursesRoute.post('/', async (c) => {
  const user = c.get('user');
  if (!user.isAdmin && !user.canTeach) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{ name?: string; description?: string | null }>();
  if (!body.name) {
    return c.json({ error: 'name_required' }, 400);
  }

  const id = crypto.randomUUID();
  try {
    await createCourse(c.env.DB, { id, name: body.name, description: body.description ?? null, createdBy: user.id });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return c.json({ error: 'name_taken' }, 409);
    }
    throw err;
  }
  // The creator becomes an active instructor of the course they just created,
  // since course-edit permission (per MCKOY_SPEC.md §17) comes from an active
  // instructor membership, not from can_teach alone.
  await createMembership(c.env.DB, {
    id: crypto.randomUUID(),
    courseId: id,
    userId: user.id,
    role: 'instructor',
    status: 'active',
  });

  const course = await getCourseById(c.env.DB, id);
  return c.json({ course }, 201);
});

coursesRoute.get('/:id', async (c) => {
  const course = await getCourseById(c.env.DB, c.req.param('id'));
  if (!course) return c.json({ error: 'not_found' }, 404);
  return c.json({
    course: {
      id: course.id,
      name: course.name,
      description: course.description,
      createdBy: course.created_by,
      createdAt: course.created_at,
    },
  });
});

coursesRoute.patch('/:id', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const course = await getCourseById(c.env.DB, courseId);
  if (!course) return c.json({ error: 'not_found' }, 404);
  if (!(await canManageCourse(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{ name?: string; description?: string | null }>();
  try {
    await updateCourse(c.env.DB, courseId, body);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return c.json({ error: 'name_taken' }, 409);
    }
    throw err;
  }

  const updated = await getCourseById(c.env.DB, courseId);
  return c.json({ course: updated });
});

coursesRoute.get('/:id/members', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  if (!(await canManageCourse(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const members = await listMembershipsByCourse(c.env.DB, courseId);
  return c.json({
    members: members.map((m) => ({
      id: m.id,
      userId: m.user_id,
      userName: m.user_name,
      userEmail: m.user_email,
      role: m.role,
      status: m.status,
      createdAt: m.created_at,
    })),
  });
});

coursesRoute.post('/:id/join', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const course = await getCourseById(c.env.DB, courseId);
  if (!course) return c.json({ error: 'not_found' }, 404);

  const existing = await getMembershipByCourseAndUser(c.env.DB, courseId, user.id);
  if (existing) return c.json({ error: 'already_requested' }, 409);

  await createMembership(c.env.DB, {
    id: crypto.randomUUID(),
    courseId,
    userId: user.id,
    role: 'student',
    status: 'pending',
  });
  return c.json({}, 201);
});

async function setMembershipStatus(c: Context<AppEnv>, status: 'active' | 'rejected') {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const membershipId = c.req.param('membershipId');
  if (!courseId || !membershipId) return c.json({ error: 'not_found' }, 404);
  if (!(await canManageCourse(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const membership = await getMembershipById(c.env.DB, membershipId);
  // The membership must belong to THIS course -- an instructor of another
  // course must not be able to act on it even if they somehow know its id.
  if (!membership || membership.course_id !== courseId || membership.status !== 'pending') {
    return c.json({ error: 'not_found' }, 404);
  }

  await updateMembershipStatus(c.env.DB, membership.id, status);
  return c.json({}, 200);
}

coursesRoute.post('/:id/members/:membershipId/approve', (c) => setMembershipStatus(c, 'active'));
coursesRoute.post('/:id/members/:membershipId/reject', (c) => setMembershipStatus(c, 'rejected'));

coursesRoute.post('/:id/invitations', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const course = await getCourseById(c.env.DB, courseId);
  if (!course) return c.json({ error: 'not_found' }, 404);
  if (!(await canManageCourse(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{ name?: string; email?: string }>();
  if (!body.name || !body.email) {
    return c.json({ error: 'name_and_email_required' }, 400);
  }

  const token = await issueInvitation(c.env.DB, {
    name: body.name,
    email: body.email,
    isAdmin: false,
    canTeach: false,
    courseId,
    membershipRole: 'student',
    invitedBy: user.id,
  });

  return c.json({ invitationUrl: `${c.env.RP_ORIGIN}/invitations/${token}` }, 201);
});

coursesRoute.get('/:id/membership', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const membership = await getMembershipByCourseAndUser(c.env.DB, courseId, user.id);
  return c.json({ membership: membership ? { role: membership.role, status: membership.status } : null });
});

coursesRoute.get('/:id/novels', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const course = await getCourseById(c.env.DB, courseId);
  if (!course) return c.json({ error: 'not_found' }, 404);

  const novels = await listNovelsByCourse(c.env.DB, courseId);
  const membership = user.isAdmin ? null : await getMembershipByCourseAndUser(c.env.DB, courseId, user.id);

  // Mirrors canViewNovel() in routes/novels.ts, but fetches the caller's
  // membership once instead of per-novel.
  const visible = novels.filter((novel) => {
    if (user.isAdmin) return true;
    if (novel.author_id === user.id) return true;
    if (novel.visibility === 'all_users') return true;
    if (!membership || membership.status !== 'active') return false;
    if (novel.visibility === 'course_students') return true;
    return novel.visibility === 'instructors' && membership.role === 'instructor';
  });

  return c.json({
    novels: await Promise.all(
      visible.map(async (novel) => ({
        id: novel.id,
        authorId: novel.author_id,
        title: novel.title,
        visibility: novel.visibility,
        tags: await listTagsByNovel(c.env.DB, novel.id),
        createdAt: novel.created_at,
      })),
    ),
  });
});

coursesRoute.post('/:id/novels', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const course = await getCourseById(c.env.DB, courseId);
  if (!course) return c.json({ error: 'not_found' }, 404);

  const membership = await getMembershipByCourseAndUser(c.env.DB, courseId, user.id);
  if (!membership || membership.role !== 'student' || membership.status !== 'active') {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{ title?: string; body?: string; visibility?: NovelVisibility; tags?: string[] }>();
  if (!body.title || !body.body) {
    return c.json({ error: 'title_and_body_required' }, 400);
  }

  const id = crypto.randomUUID();
  const visibility = body.visibility ?? 'instructors';
  await createNovel(c.env.DB, {
    id,
    authorId: user.id,
    courseId,
    title: body.title,
    body: body.body,
    visibility,
  });
  await createRevision(c.env.DB, {
    id: crypto.randomUUID(),
    novelId: id,
    title: body.title,
    body: body.body,
    revisionComment: null,
    createdBy: user.id,
  });
  if (body.tags) {
    const tagIds = await findOrCreateTagIds(c.env.DB, body.tags);
    await setNovelTags(c.env.DB, id, tagIds);
  }

  const novel = await getNovelById(c.env.DB, id);
  return c.json(
    {
      novel: {
        id: novel!.id,
        title: novel!.title,
        body: novel!.body,
        visibility: novel!.visibility,
        tags: await listTagsByNovel(c.env.DB, id),
        createdAt: novel!.created_at,
      },
    },
    201,
  );
});

coursesRoute.get('/:id/assignments', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  if (!(await hasActiveMembership(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const assignments = await listAssignmentsByCourse(c.env.DB, courseId);
  return c.json({
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      dueAt: a.due_at,
      createdBy: a.created_by,
      createdAt: a.created_at,
    })),
  });
});

coursesRoute.post('/:id/assignments', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const course = await getCourseById(c.env.DB, courseId);
  if (!course) return c.json({ error: 'not_found' }, 404);
  if (!(await canManageCourse(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{ title?: string; body?: string; dueAt?: string | null }>();
  if (!body.title || !body.body) {
    return c.json({ error: 'title_and_body_required' }, 400);
  }

  await createAssignment(c.env.DB, {
    id: crypto.randomUUID(),
    courseId,
    title: body.title,
    body: body.body,
    dueAt: body.dueAt ?? null,
    createdBy: user.id,
  });
  return c.json({}, 201);
});

coursesRoute.get('/:id/announcements', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  if (!(await hasActiveMembership(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const announcements = await listAnnouncementsByCourse(c.env.DB, courseId);
  return c.json({
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      createdBy: a.created_by,
      createdAt: a.created_at,
    })),
  });
});

coursesRoute.post('/:id/announcements', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const course = await getCourseById(c.env.DB, courseId);
  if (!course) return c.json({ error: 'not_found' }, 404);
  if (!(await canManageCourse(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{ title?: string; body?: string }>();
  if (!body.title || !body.body) {
    return c.json({ error: 'title_and_body_required' }, 400);
  }

  await createAnnouncement(c.env.DB, { id: crypto.randomUUID(), courseId, title: body.title, body: body.body, createdBy: user.id });
  return c.json({}, 201);
});
