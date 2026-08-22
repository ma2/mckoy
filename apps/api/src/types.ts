import type { Bindings } from './env';
import type { User } from './db/users';

/** Honoアプリ全体で使う型。Variables.user は requireSession ミドルウェアが設定する。 */
export type AppEnv = {
  Bindings: Bindings;
  Variables: { user: User };
};
