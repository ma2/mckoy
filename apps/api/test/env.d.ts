// テスト実行環境（cloudflare:test）のEnv型を、本番のBindingsに
// TEST_MIGRATIONSを加えた形で拡張する（@cloudflare/vitest-pool-workers向けの型宣言）。
import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';
import type { Bindings } from '../src/env';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Bindings {
    TEST_MIGRATIONS: D1Migration[];
  }
}
