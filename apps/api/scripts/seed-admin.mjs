#!/usr/bin/env node
// 仕様書 §5.1 のとおり初期管理者を構築時に作成するスクリプト。管理者専用の
// 招待APIはまだ誰も管理者がいないので使えないため、招待行をD1に直接INSERTする。
// 発行された招待URLは他の招待と同じ手順（開いてパスキーを登録）で完了する。
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
const remote = process.argv.includes('--remote');
const rpOrigin = process.env.MCKOY_RP_ORIGIN ?? (remote ? undefined : 'http://localhost:5173');
if (remote && !rpOrigin) {
  console.error('--remote requires MCKOY_RP_ORIGIN to be set (e.g. https://mckoy-api.<subdomain>.workers.dev)');
  process.exit(1);
}

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

const wranglerArgs = remote
  ? ['wrangler', 'd1', 'execute', 'mckoy_db', '--env', 'production', '--remote', `--file=${tmpFile}`]
  : ['wrangler', 'd1', 'execute', 'mckoy_db', '--local', `--file=${tmpFile}`];

try {
  execFileSync('npx', wranglerArgs, {
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
