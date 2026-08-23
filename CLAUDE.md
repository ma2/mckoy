# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクトの状態

`MCKOY_SPEC.md`（日本語の設計仕様書）が実装の正であり、コードを書く前に必ず参照すること。データモデル・API形状・
認可ルールなど、このファイルより詳細な内容が記載されている。

npm workspaces による monorepo。`apps/api`（Cloudflare Workers + Hono + D1、WebAuthn/Passkey認証）と
`apps/web`（Vite + React + TypeScript）の2ワークスペース。現時点で実装済みなのは仕様書 §23 Phase 1〜2:

- Phase 1（認証）: users / passkeys / invitations / sessions、招待受諾による登録、パスキーログイン、
  セッション管理、`/api/admin/invitations`、自分のパスキー管理。パスキー登録時はUser-Agentから
  デフォルト名を自動付与し（issue #35）、`/api/admin/users` 経由で管理者が全ユーザーを確認し、
  手動復旧のため任意ユーザーのパスキーを失効できる（仕様書 §7.1、本人によるセルフサービス削除と
  異なり最後の1件も失効可）。失効後は `/api/admin/users/:userId/passkey-reset-invitation` で
  そのユーザー宛のパスキー再登録招待（`invitations.target_user_id`）を発行できる。この招待は
  通常の招待と異なり新規アカウントを作らず、既存ユーザーへパスキーを追加するだけなので、
  講座membership・投稿した小説等の既存データがそのまま引き継がれる。
- Phase 2（講座）: courses / course_memberships、講座作成（作成者は同時にactive instructor
  membershipを得る）、講座編集、`/api/courses/:id/invitations`（講座紐付きの生徒招待、受諾で即active
  membership）、生徒からの参加申請（`/api/courses/:id/join`、pending→承認/拒否）。
  `GET /api/courses` は各講座に呼び出しユーザー自身のmembershipを含め、講座一覧UIは
  それを見て「参加申請」ボタンではなくrole/statusバッジを出す（既に何らかの形で
  関わっている講座に対して不適切な参加申請ボタンを出さないため、仕様書 §9.3）。
- Phase 3（小説）: novels / novel_revisions / tags / novel_tags。投稿は対象講座のactiveな生徒のみ、
  編集は作者のみ、削除は作者または管理者（モデレーション目的でユーザーとの相談の上そう決定 —
  仕様書自体には管理者の削除権限は明記されていない）。visibility判定は
  `routes/novels.ts` の `canViewNovel` に集約（管理者→作者本人→講座membershipの順）。改訂履歴は
  作成・編集のたびに「確定した内容」を1件保存する方式（最新revisionは常に現在の本文と一致）。
  論理削除された小説は削除者（管理者）以外には作者自身であっても見えない。
- Phase 4（講師機能）: comments / assignments / announcements。コメントは対象講座の
  active instructor（小説は全て生徒作なので実質「小説と同じ講座の講師」）または管理者のみ投稿可、
  閲覧は小説自体が見えるユーザーとなら誰でも（`canViewNovel`をそのまま再利用）。編集・削除・
  スレッド・リアクションは仕様書§13で明示的にスコープ外のため未実装。課題・お知らせは
  対象講座の active instructor/管理者のみ作成可、閲覧は対象講座の active membership（役割問わず）
  または管理者のみ（お知らせは仕様書§15に明記、課題も同じ扱いに揃えた拡張）。どちらも編集・削除
  APIは無し（作成・一覧のみ）。

これで仕様書§23 Phase 1〜4が実装済み。残るのは §26「今後の拡張候補」（R2連携・メール招待・
全文検索・通知など）で、これらは初版スコープ外として意図的に未実装。

## 実行環境に関する重要な制約

Cloudflare の `workerd` バイナリ（`wrangler dev` のローカル実行、および `@cloudflare/vitest-pool-workers`
が内部で使用）は glibc 2.32 以上を要求する。**glibc 2.31 以下のホスト（例: Ubuntu 20.04）ではどの
wrangler/workerd バージョンでもローカル実行・テストが起動できない。** この場合は Docker
（`node:22-bookworm` 等、glibc 2.35 系のイメージ）内で `apps/api` を動かすこと。ホストの glibc は
`ldd --version` で確認できる。

## コマンド

```bash
# 依存関係インストール（リポジトリルートで）
npm install

# API: ローカル D1 に migration 適用
npm run migrate:local   # = wrangler d1 migrations apply mckoy_db --local (apps/api)

# API: 初期管理者の招待を作成（ローカルD1に直接 invitations 行を投入し、招待URLを表示）。
# --remote を付けると本番D1に対して実行でき、Web/アプリ内認証を一切経由しないため、
# 管理者が全員パスキーを失いログインできなくなった場合の break-glass 復旧手段も兼ねる。
npm run seed:admin -- --name='管理者' --email='admin@example.com'   # (apps/api/scripts/seed-admin.mjs)

# API: dev server (http://localhost:8787)
npm run dev:api

# Web: dev server (http://localhost:5173, /api は 8787 にプロキシ)
npm run dev:web

# API: 型チェック / テスト
npm run typecheck --workspace apps/api
npm run test:api        # = vitest run (apps/api, @cloudflare/vitest-pool-workers を使用)

# Web: 型チェック
npm run typecheck --workspace apps/web
```

glibc が古いホストでは、上記のうち migrate:local / dev:api / test:api は Docker コンテナ内から
`/workspace` にリポジトリをバインドマウントして実行する（`apps/web` の dev server は glibc 制約と無関係
なので直接実行できるが、`wrangler` の `/api` プロキシ先が動いていないと 502 になる）。

## Mckoy とは

Mckoy は、小説創作講座向けの招待制・会員制小説投稿・管理システムであり、想定利用者は約100人（生徒・講師・管理者）。
公開閲覧や公開ユーザー登録は行わない。ログインなしでアクセスできるコンテンツは存在しない。
仕様書（`MCKOY_SPEC.md` §1–2）は、スケーラビリティや汎用性よりも最小限・低コスト・低抽象化な実装を明確に優先している。
仕様が求めていない機能・レイヤー・汎用性を勝手に追加しないこと。

## 想定技術スタック（仕様書 §3）

- **フロントエンド**: TypeScript, React, Vite（必要に応じて React Router）
- **バックエンド**: TypeScript, Hono, Cloudflare Workers 上で動作
- **データベース**: Cloudflare D1（SQL migration をソース管理。重厚な ORM や過度な抽象化は避ける）
- **ファイルストレージ**: Cloudflare R2 — 初版では未実装（カバー画像・挿絵・EPUB・PDFなし）
- **認証**: WebAuthn / Passkey のみ — パスワード認証・OAuth/Googleログインは一切実装しない

## コアとなる設計方針（拘束力あり — 議論なしに逸脱しないこと）

### グローバルな `role` カラムを持たない — 権限は直交するフラグで表現する

`users.role = admin/instructor/student` のような固定 role は意図的に採用しない。代わりに：

- `users.is_admin` — システム全体の管理者。他のすべてのチェックに優先する
- `users.can_teach` — 新規講座を作成できるか（講座への所属とは独立）
- `course_memberships.role` — `instructor` | `student`、**講座ごと**
- `course_memberships.status` — `pending` | `active` | `rejected`

これにより、あるユーザーが講座Aでは講師、講座Bでは生徒であったり、管理者兼講師であったりを自然に表現できる。
認可を実装する際は、常にこの4つのシグナルを組み合わせてチェックすること — ユーザーが固定の単一roleを持つという
前提を置かないこと。仕様書 §4, §25 を参照。

### 認可は常にサーバー側で、リクエストごとに行う

クライアント側でボタンを隠すだけでは認可とはみなさない。すべての更新系エンドポイントは、以下のいずれかを
独立に検証しなければならない：管理者 OR（対象となる**その** `course_id` において active な membership を持つ講師）
OR（対象リソースを所有する生徒本人）。講座スコープのチェックは常にその正確な `course_id` で
`course_memberships` を join して行うこと — 無関係な講座での role から権限を推測しないこと。

仕様書 §24.12 で優先度が高いとされている認可テスト（認可まわりの変更では最初に書くこと）：
- 他人の小説を編集・削除できないこと
- 別講座の講師がその講座を操作できないこと
- `pending`（まだ `active` でない）membership では講座内データが閲覧できないこと
- 小説の `visibility` が正しく機能すること（後述）
- 非管理者が管理APIを利用できないこと

### 小説の可視性

`novels.visibility` は `instructors`（デフォルト）| `course_students` | `all_users` のいずれか。
`course_students` は「student role を持つ全ユーザー」を意味しない — その小説と**同じ** `course_id` に
`active` な membership（講師または生徒）を持つユーザーを意味する。常に join で判定し、グローバルな role で
判定しないこと。

### 小説は完全な改訂履歴を持つ

小説の編集は `title`/`body` を単に上書きするのではなく、`novel_revisions` に行を作成し、過去の内容を
復元可能にすること。削除は物理削除ではなく論理削除（`deleted_at`, `deleted_by`, `deletion_comment`）とし、
通常のクエリは `deleted_at IS NULL` でフィルタする。削除済み小説を閲覧できるのは管理者のみ。

### 公開登録ではなく招待制

アカウント作成はすべて招待経由で行う：管理者が管理者・講師を招待し、管理者または講師が生徒を招待する。
招待トークンは十分に長いランダム値とし、D1にはトークンの平文ではなく SHA-256（等）のハッシュ値のみ保存する。
トークンには有効期限（デフォルト7日）があり、一度きりの使用で、管理者または招待元講師が失効できる。
登録の完了はパスワードではなく WebAuthn パスキーの作成によって行う。

### 講座参加フローには意味の異なる2経路がある

- 生徒発の参加申請: 生徒が参加申請 → membership が `pending` で作成 → 講師が承認（→ `active`）または
  拒否（→ `rejected`）
- 講師発の招待: 生徒が招待を受諾した時点で membership は直接 `active` になる

この2つのフローを混同しないこと — 講師の承認ステップの有無が異なる。

### Migration は追記のみ

一度コミットした D1 の migration ファイルは編集しない。スキーマ変更は新しい migration を追加すること
（仕様書 §24.8）。

## 初版のスコープ外（仕様書 §21）— 先回りして実装しないこと

公開アクセス/公開登録、パスワード認証、OAuth/ソーシャルログイン、招待メールの自動送信、
R2を用いたファイルストレージ（カバー画像・挿絵・EPUB・PDF）、高度な全文検索、SNS的機能（いいね・フォロー・DM）、
コメントのスレッド化/返信、リアルタイム通知、汎用RBACシステム、マイクロサービス化。
タスクがこれらのいずれかを必要とするように見える場合は、黙って実装せずに指摘すること。

## 参照: 想定DBテーブルとRESTルート

仕様書 §16（DBスキーマ）と §18（APIルート）は詳細に定義されており、ここで再掲すると正本からずれていく
リスクがあるため、テーブルやエンドポイントを構築する際は `MCKOY_SPEC.md` の該当セクションを直接参照すること。
