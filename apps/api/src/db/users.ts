// `users` テーブルへのデータアクセス。D1の生の行（snake_case、真偽値は0/1）は
// このモジュール内に留め、呼び出し側にはcamelCaseの `User` 型を返す。

export type UserRow = {
  id: string;
  name: string;
  email: string;
  is_admin: number;
  can_teach: number;
  created_at: string;
  updated_at: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  canTeach: boolean;
  createdAt: string;
  updatedAt: string;
};

/** D1の生の行を、このモジュール外で使うcamelCase形式に変換する。 */
function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isAdmin: row.is_admin === 1,
    canTeach: row.can_teach === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return row ? toUser(row) : null;
}

/** アカウント作成前に、そのメールアドレスが既に登録済みか確認するために使う。 */
export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  return row ? toUser(row) : null;
}

/** ユーザー行を作成した後、DB側で計算されるデフォルト値（created_at等）を含めて読み直して返す。 */
export async function createUser(
  db: D1Database,
  params: { id: string; name: string; email: string; isAdmin: boolean; canTeach: boolean },
): Promise<User> {
  await db
    .prepare('INSERT INTO users (id, name, email, is_admin, can_teach) VALUES (?, ?, ?, ?, ?)')
    .bind(params.id, params.name, params.email, params.isAdmin ? 1 : 0, params.canTeach ? 1 : 0)
    .run();
  const user = await getUserById(db, params.id);
  if (!user) throw new Error('failed to create user');
  return user;
}
