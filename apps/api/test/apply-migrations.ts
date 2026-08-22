// vitest.config.ts の setupFiles から読み込まれ、各テスト実行前にローカルD1へ
// migrationsディレクトリの内容を適用する。
import { env, applyD1Migrations } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
