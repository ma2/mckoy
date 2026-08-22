import type { Bindings } from './env';
import type { User } from './db/users';

export type AppEnv = {
  Bindings: Bindings;
  Variables: { user: User };
};
