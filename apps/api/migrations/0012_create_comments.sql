CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_comments_novel_id ON comments(novel_id);
