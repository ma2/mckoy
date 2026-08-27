#!/usr/bin/env node
// issue #43: 管理者権限のはく奪。
//
// Web API（`PATCH /api/admin/users/:userId`）は `isAdmin: false` を常に拒否する。
// 悪意ある管理者が他の管理者をWeb画面から締め出してシステムを乗っ取ることを防ぐため、
// 管理者権限のはく奪は seed-admin.mjs による管理者「追加」と対になる運用スクリプトとして
// ここでのみ提供する。Cloudflareアカウントへのアクセス権（`wrangler login`／APIトークン）
// のみを根拠に、アプリ内のセッション/パスキー認証を経由せず D1 を直接更新する。
// 信頼できる運用者がローカル環境から実行すること。
//
// 使い方:
//   npm run revoke:admin -- --email='admin@example.com'            # ローカルD1
//   npm run revoke:admin -- --email='admin@example.com' --remote   # 本番D1
//   （--env/--db で対象環境を切り替え可能。デフォルトは production / mckoy_db）
//
// システムが管理者不在にならないよう、最後の1人の管理者ははく奪できない
// （他に is_admin=1 のユーザーがいる場合のみ UPDATE する）。
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const email = arg('email');
if (!email) {
  console.error(
    "Usage: npm run revoke:admin -- --email='admin@example.com' [--remote] [--env=production] [--db=mckoy_db]",
  );
  process.exit(1);
}
const remote = process.argv.includes('--remote');
const wranglerEnv = arg('env', 'production');
const dbName = arg('db', 'mckoy_db');

function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

const e = sqlString(email);
// 3文（現状の確認 → 保護付きUPDATE → 結果の確認）を1ファイルで実行し、
// wrangler --json の各文の結果を突き合わせて何が起きたか判定する
// （wrangler のバージョンによって meta.changes が返らないため、SELECTで確認する）。
const sql = `SELECT COUNT(*) AS found, COALESCE(MAX(is_admin), 0) AS was_admin FROM users WHERE email = ${e};
UPDATE users SET is_admin = 0, updated_at = CURRENT_TIMESTAMP
  WHERE email = ${e} AND is_admin = 1
    AND (SELECT COUNT(*) FROM users WHERE is_admin = 1) > 1;
SELECT COALESCE(MAX(is_admin), 0) AS now_admin FROM users WHERE email = ${e};`;

const tmpFile = join(tmpdir(), `mckoy-revoke-admin-${randomUUID()}.sql`);
writeFileSync(tmpFile, sql, 'utf8');

const wranglerArgs = remote
  ? ['wrangler', 'd1', 'execute', dbName, '--env', wranglerEnv, '--remote', '--json', `--file=${tmpFile}`]
  : ['wrangler', 'd1', 'execute', dbName, '--local', '--json', `--file=${tmpFile}`];

let output;
try {
  output = execFileSync('npx', wranglerArgs, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
} finally {
  unlinkSync(tmpFile);
}

// wrangler --json は先頭にログ行が混じることがあるため、最初の '[' 以降をJSONとして読む。
const jsonStart = output.indexOf('[');
if (jsonStart === -1) {
  console.error('wrangler の出力を解釈できませんでした:\n' + output);
  process.exit(1);
}
const parsed = JSON.parse(output.slice(jsonStart));
// SELECT文の結果だけを順に取り出す（UPDATE文は results: [] を返す）。
const rows = parsed.map((r) => (Array.isArray(r?.results) ? r.results[0] : undefined)).filter(Boolean);
const before = rows[0] ?? {};
const after = rows[rows.length - 1] ?? {};
const found = Number(before.found ?? 0);
const wasAdmin = Number(before.was_admin ?? 0);
const nowAdmin = Number(after.now_admin ?? 0);

if (found === 0) {
  console.log(`\n${email} というユーザーは見つかりませんでした。`);
  process.exit(1);
}
if (wasAdmin === 0) {
  console.log(`\n${email} は既に管理者ではありません（変更なし）。`);
  process.exit(0);
}
if (nowAdmin === 1) {
  console.log(
    `\n${email} は最後の1人の管理者のため、はく奪しませんでした（システムが管理者不在に` +
      `なるのを防ぐため）。先に別の管理者を用意してください。`,
  );
  process.exit(1);
}
console.log(`\n管理者権限をはく奪しました: ${email}`);
