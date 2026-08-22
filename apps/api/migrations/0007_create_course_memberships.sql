CREATE TABLE course_memberships (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('instructor', 'student')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (course_id, user_id)
);

CREATE INDEX idx_course_memberships_course_id ON course_memberships(course_id);
CREATE INDEX idx_course_memberships_user_id ON course_memberships(user_id);
