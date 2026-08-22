// `novel_revisions` テーブルへのデータアクセス。小説の作成・編集のたびに、
// その時点で確定した内容をそのまま1件保存する（＝最新revisionは常に現在の本文と一致）。

export type NovelRevisionRow = {
  id: string;
  novel_id: string;
  title: string;
  body: string;
  revision_comment: string | null;
  created_by: string;
  created_at: string;
};

/** 小説の作成時・編集時に呼ばれ、その時点の内容を1件のrevisionとして保存する。 */
export async function createRevision(
  db: D1Database,
  params: { id: string; novelId: string; title: string; body: string; revisionComment: string | null; createdBy: string },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO novel_revisions (id, novel_id, title, body, revision_comment, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(params.id, params.novelId, params.title, params.body, params.revisionComment, params.createdBy)
    .run();
}

/** 改訂履歴を新しい順に返す。 */
export async function listRevisionsByNovel(db: D1Database, novelId: string): Promise<NovelRevisionRow[]> {
  // created_at は秒単位の精度しかないため、同じ秒内に2件保存されると順序が
  // 不定になる。rowid（挿入順）を第2キーにすることで正しい順序を保証する。
  const { results } = await db
    .prepare('SELECT * FROM novel_revisions WHERE novel_id = ? ORDER BY created_at DESC, rowid DESC')
    .bind(novelId)
    .all<NovelRevisionRow>();
  return results;
}
