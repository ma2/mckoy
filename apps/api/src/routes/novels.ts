import { Hono } from 'hono';
import type { AppEnv } from '../types';
import type { User } from '../db/users';
import { requireSession } from '../auth/session';
import { getNovelById, updateNovel, softDeleteNovel, type NovelRow, type NovelVisibility } from '../db/novels';
import { createRevision, listRevisionsByNovel } from '../db/novel_revisions';
import { findOrCreateTagIds, setNovelTags, listTagsByNovel } from '../db/tags';
import { getMembershipByCourseAndUser } from '../db/course_memberships';

export const novelsRoute = new Hono<AppEnv>();

novelsRoute.use('*', requireSession);

/**
 * instructors|course_students visibility requires an ACTIVE course membership;
 * pending grants nothing. The author and admins can always view. A soft-deleted
 * novel is treated as invisible here -- callers check deleted_at separately so
 * they can 404 even for the author (see MCKOY_SPEC.md §12).
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

async function loadVisibleNovel(db: D1Database, user: User, id: string): Promise<NovelRow | null> {
  const novel = await getNovelById(db, id);
  if (!novel) return null;
  if (novel.deleted_at !== null && !user.isAdmin) return null;
  if (!(await canViewNovel(db, user, novel))) return null;
  return novel;
}

async function serializeNovel(db: D1Database, novel: NovelRow) {
  return {
    id: novel.id,
    authorId: novel.author_id,
    courseId: novel.course_id,
    title: novel.title,
    body: novel.body,
    visibility: novel.visibility,
    tags: await listTagsByNovel(db, novel.id),
    deletedAt: novel.deleted_at,
    deletionComment: novel.deletion_comment,
    createdAt: novel.created_at,
    updatedAt: novel.updated_at,
  };
}

novelsRoute.get('/:id', async (c) => {
  const novel = await loadVisibleNovel(c.env.DB, c.get('user'), c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);
  return c.json({ novel: await serializeNovel(c.env.DB, novel) });
});

novelsRoute.patch('/:id', async (c) => {
  const user = c.get('user');
  const novel = await loadVisibleNovel(c.env.DB, user, c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);
  if (novel.author_id !== user.id) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{ title?: string; body?: string; visibility?: NovelVisibility; tags?: string[] }>();
  const title = body.title ?? novel.title;
  const text = body.body ?? novel.body;
  const visibility = body.visibility ?? novel.visibility;

  await updateNovel(c.env.DB, novel.id, { title, body: text, visibility });
  await createRevision(c.env.DB, {
    id: crypto.randomUUID(),
    novelId: novel.id,
    title,
    body: text,
    revisionComment: null,
    createdBy: user.id,
  });
  if (body.tags) {
    const tagIds = await findOrCreateTagIds(c.env.DB, body.tags);
    await setNovelTags(c.env.DB, novel.id, tagIds);
  }

  const updated = await getNovelById(c.env.DB, novel.id);
  return c.json({ novel: await serializeNovel(c.env.DB, updated!) });
});

novelsRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const novel = await loadVisibleNovel(c.env.DB, user, c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);
  if (novel.author_id !== user.id && !user.isAdmin) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{ comment?: string }>().catch(() => ({}) as { comment?: string });
  await softDeleteNovel(c.env.DB, novel.id, { deletedBy: user.id, deletionComment: body.comment ?? null });
  return c.body(null, 204);
});

novelsRoute.get('/:id/revisions', async (c) => {
  const novel = await loadVisibleNovel(c.env.DB, c.get('user'), c.req.param('id'));
  if (!novel) return c.json({ error: 'not_found' }, 404);

  const revisions = await listRevisionsByNovel(c.env.DB, novel.id);
  return c.json({
    revisions: revisions.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      revisionComment: r.revision_comment,
      createdBy: r.created_by,
      createdAt: r.created_at,
    })),
  });
});
