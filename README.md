# Mckoy

小説創作講座向けの、招待制・会員制の小説投稿・管理システムです。想定利用者は約100人
（生徒・講師・管理者）で、一般公開の閲覧やユーザー登録は行いません。詳細な仕様は
[`MCKOY_SPEC.md`](./MCKOY_SPEC.md) を参照してください。

## 主な機能

- **認証**: パスワードなし、WebAuthn / Passkey のみ。招待URL経由でのみ登録可能
- **講座**: 講師が講座を作成し、生徒を招待、または生徒からの参加申請を承認
- **小説**: 生徒が講座内に小説を投稿。改訂履歴・論理削除・公開範囲（講師のみ／講座メンバー／全員）
- **講師機能**: 小説へのコメント、課題、お知らせ

権限は固定のロールではなく、`is_admin` / `can_teach` と講座ごとの `course_memberships` を
組み合わせて表現します（同じ人が講座Aでは講師、講座Bでは生徒、といった状態を自然に扱えます）。

## 技術スタック

- **フロントエンド**: TypeScript, React, Vite
- **バックエンド**: TypeScript, [Hono](https://hono.dev/), Cloudflare Workers
- **データベース**: Cloudflare D1（SQLite）
- **認証**: WebAuthn / Passkey（[`@simplewebauthn`](https://simplewebauthn.dev/)）

npm workspaces による monorepo構成です。

```
apps/
  api/   Cloudflare Workers + Hono の API（apps/api/src、migrations、テスト）
  web/   Vite + React のフロントエンド（apps/web/src）
```

## セットアップ

```bash
npm install
```

## ローカル開発

> **注意**: バックエンドが使う Cloudflare の実行バイナリ `workerd` は glibc 2.32 以上を要求します。
> 古い環境（例: Ubuntu 20.04）では `wrangler dev` やテストがそのままでは動かないため、
> `node:22-bookworm` 等の Docker コンテナ内で実行してください。詳細は [`CLAUDE.md`](./CLAUDE.md) を参照。

```bash
# ローカル D1 に migration を適用
npm run migrate:local

# 初期管理者の招待を作成（招待URLが標準出力に表示される）
npm run seed:admin -- --name='管理者' --email='admin@example.com'

# API サーバー起動 (http://localhost:8787)
npm run dev:api

# 別ターミナルで、フロントエンド起動 (http://localhost:5173, /api は 8787 にプロキシ)
npm run dev:web
```

表示された招待URLをブラウザで開き、パスキーを登録すればログインできます。

一人で複数の役割（管理者・講師・生徒）を試したい場合は
[`docs/testing-multi-role.md`](./docs/testing-multi-role.md) を参照してください。

## テスト・型チェック

```bash
npm run typecheck --workspace apps/api
npm run typecheck --workspace apps/web
npm run test:api   # apps/api の vitest（@cloudflare/vitest-pool-workers）
```

## Cloudflare へのデプロイ

```bash
# 初回のみ: D1データベース作成、apps/api/wrangler.toml の [env.production] に
# database_id / RP_ID / RP_ORIGIN を設定
npx wrangler d1 create mckoy_db --config apps/api/wrangler.toml
npx wrangler d1 migrations apply mckoy_db --env production --remote --config apps/api/wrangler.toml

# フロントエンドをビルドし、同じ Worker から静的アセットとして配信する
npm run build --workspace apps/web
cd apps/api && npx wrangler deploy --env production
```

フロントエンドとAPIは同じ Worker・同じオリジンから配信されるため（`/api/*` はAPI、
それ以外はSPAへフォールバック）、CORSやクロスサイトCookieの設定は不要です。

## ドキュメント

- [`MCKOY_SPEC.md`](./MCKOY_SPEC.md) — 詳細な仕様書（データモデル、API、権限モデル）
- [`CLAUDE.md`](./CLAUDE.md) — 開発時の設計方針・制約（Claude Code 向けだが人間にも有用）
- [`docs/testing-multi-role.md`](./docs/testing-multi-role.md) — 一人で複数ロールをテストする手順
