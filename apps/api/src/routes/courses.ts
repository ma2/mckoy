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
  listMembershipsByUser,
  updateMembershipStatus,
} from '../db/course_memberships';
import { createNovel, getNovelById, listNovelsByCourse, type NovelVisibility } from '../db/novels';
import { createRevision } from '../db/novel_revisions';
import { findOrCreateTagIds, setNovelTags, listTagsByNovel } from '../db/tags';
import { createAssignment, listAssignmentsByCourse } from '../db/assignments';
import { createAnnouncement, listAnnouncementsByCourse } from '../db/announcements';

// 講座本体（作成・編集・一覧）、講座内のメンバー管理（参加申請・承認/拒否・招待）、
// および講座に紐付くサブリソース（小説・課題・お知らせ）の一覧/作成を扱う。
// `/api/novels/:id` 以下（詳細・編集・削除・コメント）は routes/novels.ts が担当する。

export const coursesRoute = new Hono<AppEnv>();

coursesRoute.use('*', requireSession);

/** 講座編集・メンバー管理などの「講師権限」判定。管理者、またはその講座のactive講師のみtrue。 */
async function canManageCourse(db: D1Database, user: { isAdmin: boolean; id: string }, courseId: string) {
  return user.isAdmin || isActiveInstructor(db, courseId, user.id);
}

/**
 * 課題・お知らせは講座内限定のコンテンツ: 仕様書 §15 はお知らせについて
 * 「対象講座のactive membershipを持つユーザーのみ閲覧できる。管理者はすべて閲覧・編集可能」
 * と明記しており、課題についても仕様に明示の制限はないが同じ扱いに揃えている
 * （アプリ全体に公開コンテンツが存在しない、という方針と一貫させるため）。
 */
async function hasActiveMembership(db: D1Database, user: { isAdmin: boolean; id: string }, courseId: string) {
  if (user.isAdmin) return true;
  const membership = await getMembershipByCourseAndUser(db, courseId, user.id);
  return membership !== null && membership.status === 'active';
}

/**
 * 講座一覧。ログイン済みなら誰でも閲覧可（参加申請のために講座を選べる必要があるため）。
 * 各講座に呼び出しユーザー自身のmembership（無ければnull）を含める — フロントが
 * 「講師として参加中の自分の講座」や「既に参加申請済みの講座」に対して
 * 「参加申請」ボタンを誤って出さないようにするため（issue #8）。
 */
coursesRoute.get('/', async (c) => {
  const user = c.get('user');
  const courses = await listCourses(c.env.DB);
  const myMemberships = await listMembershipsByUser(c.env.DB, user.id);
  const myMembershipByCourseId = new Map(myMemberships.map((m) => [m.course_id, m]));

  return c.json({
    courses: courses.map((course) => {
      const membership = myMembershipByCourseId.get(course.id);
      return {
        id: course.id,
        name: course.name,
        description: course.description,
        createdBy: course.created_by,
        createdAt: course.created_at,
        myMembership: membership ? { role: membership.role, status: membership.status } : null,
      };
    }),
  });
});

/** 講座を新規作成する。管理者または can_teach=true のユーザーのみ（仕様書 §17）。 */
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
  // 講座編集の権限（仕様書 §17）はcan_teachだけでは足りず、active instructor
  // membershipが必要。そのため作成者は、作成した講座のactive講師として即座に登録する。
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

/** 講座詳細。ログイン済みなら誰でも閲覧可。 */
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

/** 講座のname/descriptionを更新する。canManageCourseで許可された講師/管理者のみ。 */
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

/** 講座のメンバー一覧（pending含む）。承認待ちを確認できるよう講師/管理者限定にする。 */
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

/**
 * 生徒からの参加申請（仕様書 §9.1）。roleは常にstudent固定
 * （自己申告で講師になることはできない）。pending membershipを作成し、
 * 講師の承認を待つ。既にmembershipがあれば（pending/active/rejectedいずれでも）再申請不可。
 */
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

/** 参加申請の承認/拒否の共通処理。approve/rejectエンドポイントから呼ばれる。 */
async function setMembershipStatus(c: Context<AppEnv>, status: 'active' | 'rejected') {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const membershipId = c.req.param('membershipId');
  if (!courseId || !membershipId) return c.json({ error: 'not_found' }, 404);
  if (!(await canManageCourse(c.env.DB, user, courseId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const membership = await getMembershipById(c.env.DB, membershipId);
  // このmembershipが本当にこの講座のものであることを確認する — 別講座の講師が
  // membership idさえ知っていれば操作できてしまう、という事態を防ぐための検証。
  if (!membership || membership.course_id !== courseId || membership.status !== 'pending') {
    return c.json({ error: 'not_found' }, 404);
  }

  await updateMembershipStatus(c.env.DB, membership.id, status);
  return c.json({}, 200);
}

coursesRoute.post('/:id/members/:membershipId/approve', (c) => setMembershipStatus(c, 'active'));
coursesRoute.post('/:id/members/:membershipId/reject', (c) => setMembershipStatus(c, 'rejected'));

/** 講座紐付きの生徒招待を発行する（受諾すると承認不要で即active、仕様書 §9.2）。 */
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

/** 呼び出しユーザー自身がその講座で何者か（role/status）を返す。フロントがUI表示を出し分けるために使う自己参照エンドポイント。 */
coursesRoute.get('/:id/membership', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const membership = await getMembershipByCourseAndUser(c.env.DB, courseId, user.id);
  return c.json({ membership: membership ? { role: membership.role, status: membership.status } : null });
});

/** 講座内の小説一覧。呼び出しユーザーが見えるもの（visibilityに応じて）だけをフィルタして返す。 */
coursesRoute.get('/:id/novels', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const course = await getCourseById(c.env.DB, courseId);
  if (!course) return c.json({ error: 'not_found' }, 404);

  const novels = await listNovelsByCourse(c.env.DB, courseId);
  const membership = user.isAdmin ? null : await getMembershipByCourseAndUser(c.env.DB, courseId, user.id);

  // routes/novels.ts の canViewNovel() と同じロジックだが、小説1件ごとにDBへ
  // 問い合わせるのではなく、呼び出しユーザーのmembershipを1回だけ取得して使い回す。
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
        authorName: novel.author_name,
        title: novel.title,
        visibility: novel.visibility,
        tags: await listTagsByNovel(c.env.DB, novel.id),
        createdAt: novel.created_at,
      })),
    ),
  });
});

/** 小説を投稿する。対象講座のactiveな生徒membershipが必須（管理者・講師には投稿権限を与えない、仕様書 §17）。 */
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

/** 講座内の課題一覧。閲覧はactive membership（役割問わず）または管理者のみ。 */
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

/** 課題を作成する。対象講座の講師/管理者のみ。 */
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

/** 講座内のお知らせ一覧。閲覧はactive membership（役割問わず）または管理者のみ（仕様書 §15）。 */
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

/** お知らせを作成する。対象講座の講師/管理者のみ。 */
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
