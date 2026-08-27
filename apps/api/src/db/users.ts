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

/** 全ユーザー一覧。管理者がパスキー手動復旧（仕様書 §7.1）で対象ユーザーを選ぶ画面で使う。 */
export async function listUsers(db: D1Database): Promise<User[]> {
  const { results } = await db.prepare('SELECT * FROM users ORDER BY name ASC').all<UserRow>();
  return results.map(toUser);
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

/**
 * 既存ユーザーの権限フラグ（is_admin / can_teach）を更新する。issue #43 の
 * 管理者向けユーザー編集画面（仕様書 §22「講師資格管理」「管理者権限管理」）で使う。
 * 「管理者権限のはく奪（isAdmin: false）はWeb経由では許可しない」という方針の判定は
 * 呼び出し側（routes/admin-users.ts）で行い、ここは渡されたフラグをそのまま反映する。
 */
export async function updateUser(
  db: D1Database,
  id: string,
  params: { isAdmin?: boolean; canTeach?: boolean },
): Promise<void> {
  if (params.isAdmin !== undefined) {
    await db
      .prepare('UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(params.isAdmin ? 1 : 0, id)
      .run();
  }
  if (params.canTeach !== undefined) {
    await db
      .prepare('UPDATE users SET can_teach = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(params.canTeach ? 1 : 0, id)
      .run();
  }
}
