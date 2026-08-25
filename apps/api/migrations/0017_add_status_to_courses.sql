-- 講座の状態（オープン/クローズ/クローズ・閲覧のみ）を表す列を追加する（issue #17）。
-- 新規作成した講座の初期状態は常にオープン（DEFAULT 'open'）。
ALTER TABLE courses ADD COLUMN status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'closed', 'closed_readonly'));
