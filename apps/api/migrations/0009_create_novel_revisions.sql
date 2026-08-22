CREATE TABLE novel_revisions (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  revision_comment TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_novel_revisions_novel_id ON novel_revisions(novel_id);
