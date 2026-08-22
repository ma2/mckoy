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

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  return row ? toUser(row) : null;
}

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
