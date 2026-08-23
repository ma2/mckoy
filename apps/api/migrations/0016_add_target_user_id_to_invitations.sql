-- 既存ユーザーへのパスキー再登録招待（仕様書 §7.1 手動復旧フロー）を表すためのカラム。
-- 設定されていれば「既存ユーザーへのパスキー再登録招待」、NULLなら従来通り
-- 「新規アカウント作成招待」として扱う。
ALTER TABLE invitations ADD COLUMN target_user_id TEXT REFERENCES users(id);
