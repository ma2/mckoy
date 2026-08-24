import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireSession, requireAdmin } from '../auth/session';
import { listDeletedNovels } from '../db/novels';

// 管理者による削除済み小説の確認（仕様書 §12「管理者は必要に応じて削除済み小説を
// 確認できる」）。個別の小説はIDが分かれば元々 GET /novels/:id で管理者権限により
// 閲覧できたが、一覧・発見手段がなかったため追加した（issue #45）。

export const adminNovelsRoute = new Hono<AppEnv>();

adminNovelsRoute.use('*', requireSession, requireAdmin);

/** 論理削除済みの小説一覧（削除日時の新しい順）。 */
adminNovelsRoute.get('/deleted', async (c) => {
  const novels = await listDeletedNovels(c.env.DB);
  return c.json({
    novels: novels.map((n) => ({
      id: n.id,
      title: n.title,
      authorName: n.author_name,
      courseId: n.course_id,
      courseName: n.course_name,
      deletedAt: n.deleted_at,
      deletedByName: n.deleted_by_name,
      deletionComment: n.deletion_comment,
    })),
  });
});
