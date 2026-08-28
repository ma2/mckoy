#!/usr/bin/env node
// issue #69: d1-backup.yml が GitHub Actions artifact として保存している本番D1の
// SQLダンプ（仕様書 §19）を、ローカルに1コマンドで取得する運用スクリプト。
// 仕様書 §19.2 の手動手順（gh run list → gh run download の2ステップ）を置き換える。
//
// GitHub CLI（`gh`）がインストール・認証済みであること（`gh auth login`）が前提。
// ダンプにはユーザーの氏名・メールアドレス等のPIIが平文で含まれる（仕様書 §19.1）。
// リポジトリ自体と同等の信頼境界として扱い、取得後の取り扱いに注意すること。
//
// 使い方:
//   npm run backup:download                        # 最新の成功実行の artifact を ./backup-download に取得
//   npm run backup:download -- --list              # 直近のバックアップ実行を一覧表示するだけ
//   npm run backup:download -- --run=<id>          # 特定の run id の artifact を取得
//   npm run backup:download -- --out=<dir>         # 保存先（デフォルト ./backup-download）
//   npm run backup:download -- --repo=<owner/name> # 対象リポジトリ（デフォルト ma2/mckoy）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const repo = arg('repo', 'ma2/mckoy');
const outDir = resolve(arg('out', 'backup-download'));
const runId = arg('run', null);
const wantList = process.argv.includes('--list');
const WORKFLOW = 'd1-backup.yml';
const SQL_NAME = 'mckoy-db-backup.sql';

function gh(args, { inherit = false } = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
}

try {
  execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
} catch {
  console.error(
    'GitHub CLI（gh）がインストール・認証されていません。https://cli.github.com/ を参照し、`gh auth login` を実行してください。',
  );
  process.exit(1);
}

if (wantList) {
  console.log(`${repo} の直近の「D1 バックアップ」実行:\n`);
  gh(['run', 'list', '--repo', repo, '--workflow', WORKFLOW, '--limit', '10'], { inherit: true });
  process.exit(0);
}

// 対象 run を決める（未指定なら最新の成功実行）。
let targetRun = runId;
if (!targetRun) {
  const runs = JSON.parse(
    gh([
      'run', 'list', '--repo', repo, '--workflow', WORKFLOW,
      '--status', 'success', '--limit', '1',
      '--json', 'databaseId,createdAt',
    ]),
  );
  if (runs.length === 0) {
    console.error(`成功した「D1 バックアップ」実行が見つかりません（${repo}）。`);
    process.exit(1);
  }
  targetRun = String(runs[0].databaseId);
  console.log(`最新の成功実行: run ${targetRun}（${runs[0].createdAt}）`);
}

mkdirSync(outDir, { recursive: true });

// 既存の出力（サブディレクトリ名の衝突）を避けるため一時ディレクトリに展開してから移動する。
const tmpDir = join(outDir, `.download-${targetRun}-${Date.now()}`);
mkdirSync(tmpDir);
try {
  console.log(`artifact をダウンロード中: run ${targetRun}`);
  gh(['run', 'download', targetRun, '--repo', repo, '--dir', tmpDir], { inherit: true });

  // gh run download は artifact 名のサブディレクトリに展開する。その中の .sql を探す。
  const sqlPath = findFile(tmpDir, SQL_NAME);
  if (!sqlPath) {
    console.error(`ダウンロードした artifact に ${SQL_NAME} が見つかりませんでした。`);
    process.exit(1);
  }

  const finalPath = join(outDir, `mckoy-db-backup-${targetRun}.sql`);
  if (existsSync(finalPath)) rmSync(finalPath);
  renameSync(sqlPath, finalPath);

  const { size } = statSync(finalPath);
  console.log(`\n完了: ${finalPath}（${(size / 1024).toFixed(1)} KiB）`);
  console.log('復元手順は MCKOY_SPEC.md §19.2 を参照してください。');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

/** dir 以下を再帰的に探して name に一致する最初のファイルのパスを返す。 */
function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}
