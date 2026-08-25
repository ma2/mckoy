import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getUserById, type User } from '../db/users';
import { requireSession } from '../auth/session';
import { getNovelById, updateNovel, softDeleteNovel, type NovelRow, type NovelVisibility } from '../db/novels';
import { createRevision, listRevisionsByNovel } from '../db/novel_revisions';
import { findOrCreateTagIds, setNovelTags, listTagsByNovel } from '../db/tags';
import { getMembershipByCourseAndUser, isActiveInstructor } from '../db/course_memberships';
import { createComment, listCommentsByNovel } from '../db/comments';

// 小説そのもの（詳細・編集・削除・改訂履歴）と、小説へのコメントを扱う。
// 一覧・投稿（`/courses/:id/novels`）は routes/courses.ts が担当する。

export const novelsRoute = new Hono<AppEnv>();

novelsRoute.use('*', requireSession);

/**
 * 可視性判定の中心ロジック。instructors/course_studentsはactiveな講座membershipが
 * 必須（pendingでは不可）。作者本人と管理者は常に閲覧可。論理削除された小説は
 * ここでは判定しない — deleted_atのチェックは呼び出し側で別途行い、作者本人であっても
 * 404にできるようにする（仕様書 §12）。
 */
export async function canViewNovel(db: D1Database, user: User, novel: NovelRow): Promise<boolean> {
  if (user.isAdmin) return true;
  if (novel.author_id === user.id) return true;
  if (novel.visibility === 'all_users') return true;
  const membership = await getMembershipByCourseAndUser(db, novel.course_id, user.id);
  if (!membership || membership.status !== 'active') return false;
  if (novel.visibility === 'course_students') return true;
  return novel.visibility === 'instructors' && membership.role === 'instructor';
}

/** 「存在し、かつ閲覧可能」な小説を取得する共通処理。GET/PATCH/DELETE/revisions/commentsが全てこれを通す。 */
async function loadVisibleNovel(db: D1Database, user: User, id: string): Promise<NovelRow | null> {
  const novel = await getNovelById(db, id);
  if (!novel) return null;
  if (novel.deleted_at !== null && !user.isAdmin) return null;
  if (!(await canViewNovel(db, user, novel))) return null;
  return novel;
}

/**
 * DBの行をAPIレスポンス形式（camelCase、タグ配列付き）に変換する。作者の氏名も含める
 * （自分以外の小説を見る際に著者名を表示するため、issue #57）。
 */
async function serializeNovel(db: D1Database, novel: NovelRow) {
  const author = await getUserById(db, novel.author_id);
  return {
    id: novel.id,
    authorId: novel.author_id,
    authorName: author?.name ?? '',
    courseId: novel.course_id,
    title: novel.title,
    body: novel.body,
    plot: novel.plot,
    visibility: novel.visibility,
    tags: await listTagsByNovel(db, novel.id),
    deletedAt: novel.deleted_at,
    deletionComment: novel.deletion_comment,
    createdAt: novel.created_at,
    updatedAt: novel.updated_at,
  };
}

/** 小説詳細。閲覧不可（存在しない/visibility外/削除済みで非管理者）の場合は一律404で存在有無を秘匿する。 */
novelsRoute.get('/:id', async (c) => {
  const novel = await loadVisibleNovel(c.env.DB, c.get('user'), c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);
  return c.json({ novel: await serializeNovel(c.env.DB, novel) });
});

/** 小説を編集する。作者本人のみ（管理者にも編集権限は与えない、ユーザーとの合意事項）。編集の度にrevisionを1件残す。 */
novelsRoute.patch('/:id', async (c) => {
  const user = c.get('user');
  const novel = await loadVisibleNovel(c.env.DB, user, c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);
  if (novel.author_id !== user.id) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{
    title?: string;
    body?: string;
    plot?: string;
    visibility?: NovelVisibility;
    tags?: string[];
    revisionComment?: string | null;
  }>();
  const title = body.title ?? novel.title;
  const text = body.body ?? novel.body;
  const plot = body.plot !== undefined ? body.plot || null : novel.plot;
  const visibility = body.visibility ?? novel.visibility;

  await updateNovel(c.env.DB, novel.id, { title, body: text, plot, visibility });
  await createRevision(c.env.DB, {
    id: crypto.randomUUID(),
    novelId: novel.id,
    title,
    body: text,
    plot,
    revisionComment: body.revisionComment || null,
    createdBy: user.id,
  });
  if (body.tags) {
    const tagIds = await findOrCreateTagIds(c.env.DB, body.tags);
    await setNovelTags(c.env.DB, novel.id, tagIds);
  }

  const updated = await getNovelById(c.env.DB, novel.id);
  return c.json({ novel: await serializeNovel(c.env.DB, updated!) });
});

/** 小説を論理削除する。作者本人 または 管理者（モデレーション目的、ユーザーと相談の上で追加した権限）。 */
novelsRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const novel = await loadVisibleNovel(c.env.DB, user, c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);
  if (novel.author_id !== user.id && !user.isAdmin) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{ comment?: string }>().catch(() => ({}) as { comment?: string });
  await softDeleteNovel(c.env.DB, novel.id, { deletedBy: user.id, deletionComment: body.comment ?? null });
  return c.body(null, 204);
});

/** 改訂履歴一覧。閲覧可否は小説本体と同じ判定（loadVisibleNovel）。 */
novelsRoute.get('/:id/revisions', async (c) => {
  const novel = await loadVisibleNovel(c.env.DB, c.get('user'), c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);

  const revisions = await listRevisionsByNovel(c.env.DB, novel.id);
  return c.json({
    revisions: revisions.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      plot: r.plot,
      revisionComment: r.revision_comment,
      createdBy: r.created_by,
      createdAt: r.created_at,
    })),
  });
});

/** コメント一覧。閲覧可否は小説本体と同じ判定（コメント専用の可視性ルールは持たない）。 */
novelsRoute.get('/:id/comments', async (c) => {
  const novel = await loadVisibleNovel(c.env.DB, c.get('user'), c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);

  const comments = await listCommentsByNovel(c.env.DB, novel.id);
  return c.json({
    comments: comments.map((cm) => ({
      id: cm.id,
      userId: cm.user_id,
      userName: cm.user_name,
      body: cm.body,
      createdAt: cm.created_at,
    })),
  });
});

/** 小説にコメントを投稿する。対象講座のactive講師 または 管理者のみ（生徒自身はコメントできない）。 */
novelsRoute.post('/:id/comments', async (c) => {
  const user = c.get('user');
  const novel = await loadVisibleNovel(c.env.DB, user, c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);

  // 仕様書 §13: 講師は「自分が講師として所属する講座の生徒の小説」にコメントできる。
  // 小説の作者は必ず生徒なので、これは「その小説の講座のactive講師である」ことと同値になる。
  const canComment = user.isAdmin || (await isActiveInstructor(c.env.DB, novel.course_id, user.id));
  if (!canComment) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{ body?: string }>();
  if (!body.body) return c.json({ error: 'body_required' }, 400);

  await createComment(c.env.DB, { id: crypto.randomUUID(), novelId: novel.id, userId: user.id, body: body.body });
  return c.json({}, 201);
});
