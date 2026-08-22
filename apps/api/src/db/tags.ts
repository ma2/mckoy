/** Finds or creates a tag row per name and returns their ids, in no particular order. */
export async function findOrCreateTagIds(db: D1Database, names: string[]): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))];
  const ids: string[] = [];
  for (const name of unique) {
    const row = await db
      .prepare(
        `INSERT INTO tags (id, name) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET name = excluded.name
         RETURNING id`,
      )
      .bind(crypto.randomUUID(), name)
      .first<{ id: string }>();
    ids.push(row!.id);
  }
  return ids;
}

/** Replaces a novel's tag associations wholesale with the given tag ids. */
export async function setNovelTags(db: D1Database, novelId: string, tagIds: string[]): Promise<void> {
  await db.prepare('DELETE FROM novel_tags WHERE novel_id = ?').bind(novelId).run();
  for (const tagId of tagIds) {
    await db.prepare('INSERT INTO novel_tags (novel_id, tag_id) VALUES (?, ?)').bind(novelId, tagId).run();
  }
}

export async function listTagsByNovel(db: D1Database, novelId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT t.name as name FROM novel_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.novel_id = ? ORDER BY t.name ASC`,
    )
    .bind(novelId)
    .all<{ name: string }>();
  return results.map((r) => r.name);
}
