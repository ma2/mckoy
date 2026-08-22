#!/usr/bin/env node
// Bootstraps the initial admin per MCKOY_SPEC.md §5.1: the very first admin is
// created out-of-band (not through the admin-only invitation API, since no
// admin exists yet) by inserting an invitation row directly into local D1.
// The resulting invitation URL is completed like any other invite: the
// recipient opens it and registers a passkey.
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const name = arg('name', 'Admin');
const email = arg('email', 'admin@example.com');
const rpOrigin = process.env.MCKOY_RP_ORIGIN ?? 'http://localhost:5173';

const id = randomUUID();
const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 19)
  .replace('T', ' ');

function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

const sql = `INSERT INTO invitations (id, email, name, is_admin, can_teach, token_hash, expires_at, invited_by)
VALUES (${sqlString(id)}, ${sqlString(email)}, ${sqlString(name)}, 1, 1, ${sqlString(tokenHash)}, ${sqlString(expiresAt)}, NULL);`;

const tmpFile = join(tmpdir(), `mckoy-seed-admin-${id}.sql`);
writeFileSync(tmpFile, sql, 'utf8');

try {
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'mckoy_db', '--local', `--file=${tmpFile}`], {
    stdio: 'inherit',
    cwd: new URL('..', import.meta.url),
  });
} finally {
  unlinkSync(tmpFile);
}

console.log('\n初期管理者の招待を作成しました。');
console.log(`  氏名: ${name}`);
console.log(`  メール: ${email}`);
console.log(`  招待URL (7日間有効・一度だけ使用可能):\n  ${rpOrigin}/invitations/${token}`);
