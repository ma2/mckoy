CREATE TABLE novels (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'instructors'
    CHECK (visibility IN ('instructors', 'course_students', 'all_users')),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id),
  deletion_comment TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_novels_course_id ON novels(course_id);
CREATE INDEX idx_novels_author_id ON novels(author_id);
