CREATE TABLE novel_tags (
  novel_id TEXT NOT NULL REFERENCES novels(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (novel_id, tag_id)
);
