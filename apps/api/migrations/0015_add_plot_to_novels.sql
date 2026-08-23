-- タイトル・本文とは別に、任意でプロットを保存できるようにする（issue #19）。
-- 改訂履歴（novel_revisions）も本文と同様に確定内容のスナップショットを保存する
-- テーブルなので、同じくplot列を追加する。
ALTER TABLE novels ADD COLUMN plot TEXT;
ALTER TABLE novel_revisions ADD COLUMN plot TEXT;
