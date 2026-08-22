export type NovelRevisionRow = {
  id: string;
  novel_id: string;
  title: string;
  body: string;
  revision_comment: string | null;
  created_by: string;
  created_at: string;
};

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

export async function listRevisionsByNovel(db: D1Database, novelId: string): Promise<NovelRevisionRow[]> {
  // created_at has only second resolution, so two revisions saved within the
  // same second would tie; rowid (insertion order) breaks the tie correctly.
  const { results } = await db
    .prepare('SELECT * FROM novel_revisions WHERE novel_id = ? ORDER BY created_at DESC, rowid DESC')
    .bind(novelId)
    .all<NovelRevisionRow>();
  return results;
}
