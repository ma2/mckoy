# Mckoy 開発仕様書

## 1. 目的

Mckoy は、小説創作講座で利用する会員制の小説投稿・管理システムである。

利用者は約100人を想定し、創作コースの生徒・講師・管理者のみが利用する。一般ユーザー向けの公開閲覧や公開ユーザー登録は行わない。

初版では機能を必要最小限に絞り、Cloudflare 上で低コストかつ保守しやすい構成を採用する。

---

## 2. 開発方針

- Cloudflare を主要な実行・保存基盤とする。
- Web アプリケーション/API は Cloudflare Workers 上で動作させる。
- サーバーサイドフレームワークには Hono を使用する。
- リレーショナルデータは Cloudflare D1 に保存する。
- 将来の画像・EPUB・PDF 等は Cloudflare R2 に保存する。
- 認証は WebAuthn / Passkey のみを使用する。
- パスワード認証は実装しない。
- 一般公開のユーザー登録画面は実装しない。
- 初版では権限管理ライブラリを導入せず、アプリケーションコードで明示的に認可を実装する。
- 過度な抽象化、汎用RBAC、将来用の不要な機能は追加しない。
- 100人程度の利用規模に対して、過剰なスケーラビリティ設計を行わない。

---

## 3. 想定技術スタック

### フロントエンド

- TypeScript
- React
- Vite
- 必要に応じて React Router 等を利用する

### バックエンド

- TypeScript
- Hono
- Cloudflare Workers

### データベース

- Cloudflare D1
- SQL ベースの migration を使用する
- ORM を使用する場合は Cloudflare D1 との相性を優先し、過度に抽象化しない

### ファイルストレージ

初版では未使用。

将来以下を Cloudflare R2 に保存する。

- カバー画像
- 挿絵
- EPUB
- PDF
- その他の添付ファイル

### 認証

- WebAuthn
- Passkey
- 1ユーザーにつき複数のパスキーを登録可能とする
- パスワード認証は提供しない

---

## 4. ユーザー種別と権限モデル

Mckoy では、管理者権限と講座内の役割を分離する。

### 4.1 システム権限

`users.is_admin` で管理する。

- `true`: 管理者
- `false`: 一般ユーザー

管理者はシステム上のすべての操作を行うことができる。

### 4.2 講座内の役割

`course_memberships.role` で管理する。

値は以下の2種類。

- `instructor`
- `student`

同一ユーザーが、講座Aでは講師、講座Bでは生徒であってもよい。

### 4.3 講師資格

講座に所属する前から「講師として講座を新規作成できる」ユーザーを識別する必要があるため、`users.can_teach` を持たせる。

- `true`: 新しい講座を作成できる
- `false`: 新しい講座を作成できない

管理者は `can_teach` に関係なく講座を作成できる。

### 4.4 権限判定の基本

システム管理権限:

```ts
user.isAdmin
```

講座の講師:

```ts
membership.role === 'instructor'
```

講座の生徒:

```ts
membership.role === 'student'
```

初版では以下のような汎用権限モデルは作らない。

- roles テーブル
- permissions テーブル
- role_permissions テーブル
- user_roles テーブル
- 汎用RBACエンジン

---

## 5. ユーザー登録

Mckoy は招待制とする。

一般ユーザーが自分でアカウントを作成する公開サインアップ画面は設けない。

### 5.1 管理者の登録

初期管理者は初期構築時に作成する。

以降の管理者は既存管理者が招待する。

### 5.2 講師の登録

管理者が講師を招待する。

招待時に以下を指定する。

- 氏名
- メールアドレス
- `can_teach = true`
- 必要に応じて `is_admin`

### 5.3 生徒の登録

管理者または講師が生徒を招待する。

招待時に以下を指定する。

- 氏名
- メールアドレス
- 必要に応じて対象講座

### 5.4 招待URL

招待URLには十分長いランダムトークンを含める。

例:

```text
https://mckoy.example.com/invitations/<random-token>
```

D1 にはトークンの平文を保存せず、SHA-256 等でハッシュ化した値のみ保存する。

招待には以下の制約を設ける。

- 有効期限あり
- 初期値は7日
- 一度利用したら再利用不可
- 管理者または招待元講師が失効可能
- 必要に応じて再発行可能

### 5.5 初回登録フロー

1. 管理者または講師が招待を作成する。
2. 招待URLを本人へ渡す。
3. 本人が招待URLを開く。
4. 招待内容（氏名など）を確認する。
5. WebAuthn challenge を発行する。
6. 本人がパスキーを作成する。
7. パスキー登録成功後にユーザー登録を完了する。
8. 招待を使用済みにする。
9. 対象講座への招待を伴う場合は membership を作成する。

初版では招待メール自動送信を必須としない。

管理画面から招待URLをコピーできればよい。

---

## 6. ログイン

ログインはパスキーのみとする。

パスワードログインは実装しない。

ログイン画面は原則として以下のみでよい。

```text
[ パスキーでログイン ]
```

discoverable credential を利用し、可能な限りメールアドレスやユーザー名の事前入力なしで認証する。

認証成功後はセッションを発行する。

セッションCookieには最低限以下を設定する。

- HttpOnly
- Secure
- SameSite=Lax または Strict

セッションID等の秘密情報は推測困難なランダム値とする。

---

## 7. パスキー管理とアカウント復旧

1ユーザーにつき複数のパスキーを登録できるようにする。

例:

- iPhone
- Windows Hello
- iPad
- Mac

ユーザーはログイン後、自分のパスキー一覧を確認・追加・削除できる。

パスキー登録時に名前を空のまま保存すると一覧でどれがどれか判別できなくなるため、
登録リクエストのUser-AgentヘッダーからOS・ブラウザを推測し「iPhone Safari」のような
デフォルト名を自動的に付与する（拡張、issue #35）。

### 7.1 パスキーをすべて失った場合

メール＋パスワードによる復旧は行わない。

以下の手動復旧フローを採用する。

1. ユーザーが管理者へ連絡する。
2. 管理者が講座等の運用上の手段で本人確認する。
3. 管理者が既存パスキーを必要に応じて失効させる。
4. 管理者がパスキー再登録用の一時招待URLを発行する。
5. ユーザーが新しいパスキーを登録する。

手順3のため、管理者は全ユーザー一覧（`GET /api/admin/users`）から対象ユーザーを選び、
そのユーザーのパスキー一覧を確認・失効できる（`GET`/`DELETE /api/admin/users/:userId/passkeys`）。
本人によるセルフサービス削除（`DELETE /api/me/passkeys/:id`）と異なり、最後の1件でも
失効できる（失効後、手順4で新しい招待URLを発行する運用が前提のため）。手順4の招待URL発行は
既存の「招待管理」画面（管理者専用の講座に紐付かない招待）をそのまま使う。

---

## 8. 講座

講師は複数の講座を作成できる。

講座は固有の名称を持つ。

### 講座の主な属性

- id
- name
- description
- created_by
- created_at
- updated_at

### 講師ができること

- 講座を作成
- 自分が講師である講座を編集
- 生徒を招待
- 生徒の参加申請を承認・拒否
- 課題を作成・編集・削除
- お知らせを作成・編集・削除
- 生徒の小説へコメント

管理者はすべての講座に対して同じ操作を行える。

---

## 9. 講座参加

ユーザーと講座は多対多とする。

`course_memberships` を join table とする。

### membership の属性

- id
- course_id
- user_id
- role
- status
- created_at
- updated_at

### role

- `instructor`
- `student`

### status

- `pending`
- `active`
- `rejected`

必要になった場合のみ `withdrawn` 等を追加する。

### 9.1 生徒からの参加申請

1. 生徒が参加可能な講座を選択する。
2. `pending` membership を作成する。
3. 講師が承認すると `active` になる。
4. 拒否すると `rejected` になる。

管理者はどの講座に対してもmembershipを介さず既に全権限でアクセスできるため、
参加申請自体ができない（`POST /api/courses/:id/join` は管理者に対して403を返す。
拡張、issue #37）。講座一覧UIも管理者には「参加申請」ボタンを表示しない。

### 9.2 講師からの招待

講師が自分の講座に生徒を招待した場合は、招待受諾時点で `active` membership としてよい。

つまり、

- 生徒からの参加申請 → 講師承認が必要
- 講師からの招待 → 生徒が受諾すれば参加確定

とする。

### 9.3 講座一覧でのUI表示

講座一覧画面では、ログインユーザーがその講座に既にmembershipを持つ場合（role・statusを
問わない。講師として参加中、生徒として参加中、参加申請が承認待ち、いずれの場合も含む）は
「参加申請」ボタンではなく現在のrole/statusを表示する。講師が自分の講座に対して参加申請
できてしまう、といった不適切な導線を防ぐため。

---

## 10. 小説

生徒は自分の小説を投稿できる。

### 10.1 小説の属性

最低限以下を持つ。

- id
- author_id
- title
- body
- plot
- visibility
- created_at
- updated_at

`title` は必須。`body`・`plot`（あらすじ・プロット）はいずれも任意（拡張、issue #19）。
本文とは別にプロットのみを先に投稿することもできる。

### 10.2 タグ

小説は複数のタグを持てる。

タグは多対多で管理する。

- tags
- novel_tags

### 10.3 可視範囲

`visibility` は以下の3種類。

- `instructors`
- `course_students`
- `all_users`

デフォルトは `instructors`。

#### instructors

その小説の作者が所属している対象講座の講師と管理者だけが閲覧可能。

#### course_students

対象講座に所属する active な講師・生徒と管理者が閲覧可能。

#### all_users

Mckoy にログインしているすべての利用者が閲覧可能。

一般インターネットへの公開はしない。

### 10.4 小説と講座の関連

小説はどの講座への提出・投稿かを明確にするため、初版では小説を1つの講座に所属させる。

`novels.course_id` を持たせる。

複数講座への同時所属は初版ではサポートしない。

必要になった時点で join table 化を検討する。

---

## 11. 小説の編集履歴

生徒は自分の小説を修正できる。

修正時に任意の修正コメントを付与できる。

本文を上書きするだけではなく、初版から履歴を残す。

### novel_revisions

- id
- novel_id
- title
- body
- plot
- revision_comment
- created_by
- created_at

小説更新時は更新前または更新後の状態を revision として保存する。

実装方法は一貫していればどちらでもよいが、仕様上「過去の本文を復元できる」ことを目標とする。

---

## 12. 小説の削除

ユーザーは自分の小説を削除できる。

削除時に任意の削除コメントを付与できる。

初版では物理削除ではなく論理削除を推奨する。

`novels` に以下を持たせる。

- deleted_at
- deleted_by
- deletion_comment

通常の一覧や検索では `deleted_at IS NULL` の小説のみ表示する。

管理者は必要に応じて削除済み小説を確認できる。

---

## 13. コメント

講師は、自分が講師として所属する講座の生徒の小説にコメントを投稿できる。

管理者はすべての小説にコメントできる。

### comments

- id
- novel_id
- user_id
- body
- created_at
- updated_at

初版ではスレッド、返信、リアクション等は実装しない。

---

## 14. 課題

講師は自分の講座に課題を出せる。

### assignments

- id
- course_id
- title
- body
- due_at
- created_by
- created_at
- updated_at

初版では課題提出と小説を自動関連付けする高度なワークフローは必須としない。

必要であれば `novels.assignment_id` を nullable で追加する。

---

## 15. お知らせ

講師は自分の講座にお知らせを投稿できる。

### announcements

- id
- course_id
- title
- body
- created_by
- created_at
- updated_at

対象講座の active membership を持つユーザーのみ閲覧できる。

管理者はすべて閲覧・編集可能。

---

## 16. 推奨DB構造

### users

```text
id
name
email
is_admin
can_teach
created_at
updated_at
```

### passkeys

```text
id
user_id
credential_id
public_key
counter
transports
created_at
last_used_at
```

`user_id -> users.id`

### invitations

```text
id
email
name
is_admin
can_teach
course_id nullable
membership_role nullable
token_hash
expires_at
used_at
revoked_at
invited_by
created_at
```

### courses

```text
id
name
description
created_by
created_at
updated_at
```

### course_memberships

```text
id
course_id
user_id
role
status
created_at
updated_at
```

制約:

```text
UNIQUE(course_id, user_id)
```

### novels

```text
id
author_id
course_id
title
body
plot
visibility
deleted_at
deleted_by
deletion_comment
created_at
updated_at
```

### novel_revisions

```text
id
novel_id
title
body
plot
revision_comment
created_by
created_at
```

### tags

```text
id
name
```

### novel_tags

```text
novel_id
tag_id
```

制約:

```text
UNIQUE(novel_id, tag_id)
```

### comments

```text
id
novel_id
user_id
body
created_at
updated_at
```

### assignments

```text
id
course_id
title
body
due_at
created_by
created_at
updated_at
```

### announcements

```text
id
course_id
title
body
created_by
created_at
updated_at
```

---

## 17. 認可ルール

認可は必ずサーバー側で行う。

フロントエンドでボタンを非表示にするだけでは認可とみなさない。

### 管理者

`users.is_admin = true`

- すべての機能を利用可能
- 全ユーザーを管理可能
- 講師資格を設定可能
- 全講座を管理可能
- 全小説を閲覧可能
- 全コメントを管理可能
- 招待を作成可能
- パスキー復旧処理を実施可能

### 講師

以下のいずれか。

- `users.can_teach = true` により講座作成可能
- 対象講座に `role = instructor AND status = active` の membership がある

対象講座について、

- 講座編集
- 生徒招待
- 参加申請承認・拒否
- 課題管理
- お知らせ管理
- 生徒作品閲覧
- コメント投稿

が可能。

### 生徒

対象講座に、

```text
role = student
status = active
```

の membership がある。

- 自分の小説を投稿
- 自分の小説を編集
- 自分の小説を削除
- 可視範囲に応じて他ユーザーの小説を閲覧
- 講座への参加申請

が可能。

---

## 18. API設計方針

REST API を基本とする。

例:

```text
POST   /api/auth/registration/options
POST   /api/auth/registration/verify
POST   /api/auth/login/options
POST   /api/auth/login/verify
POST   /api/auth/logout

GET    /api/me
GET    /api/me/passkeys
POST   /api/me/passkeys
DELETE /api/me/passkeys/:id

GET    /api/admin/users                       # 管理者専用。手動復旧（§7.1）の対象ユーザーを選ぶための一覧
GET    /api/admin/users/:userId/passkeys       # 管理者専用
DELETE /api/admin/users/:userId/passkeys/:id   # 管理者専用。本人によるセルフサービス削除と異なり最後の1件も失効できる

GET    /api/courses   # 各講座に呼び出しユーザー自身のmembership(role/status、無ければnull)を含める（§9.3）
POST   /api/courses
GET    /api/courses/:id
PATCH  /api/courses/:id

POST   /api/courses/:id/join
POST   /api/courses/:id/members/:membershipId/approve
POST   /api/courses/:id/members/:membershipId/reject

GET    /api/courses/:id/novels
POST   /api/courses/:id/novels
GET    /api/novels/:id
PATCH  /api/novels/:id
DELETE /api/novels/:id

GET    /api/novels/:id/revisions
POST   /api/novels/:id/comments

GET    /api/courses/:id/assignments
POST   /api/courses/:id/assignments

GET    /api/courses/:id/announcements
POST   /api/courses/:id/announcements

POST   /api/admin/invitations
POST   /api/invitations/:token/register
```

実装時に必要に応じて調整してよい。

---

## 19. バックアップ

小説本文は重要データであるため、D1 の標準復旧機能だけに依存しない。

定期バックアップ機能を持つ。

最低要件:

- D1 データを定期的にエクスポート
- Cloudflare 外にも復旧可能な形式で保持することを検討
- バックアップからの復元手順を文書化する

初版では自動復元UIまでは不要。

---

## 20. セキュリティ要件

- HTTPS を前提とする
- パスワード認証を実装しない
- Passkey / WebAuthn を使用する
- WebAuthn challenge は十分なランダム性を持たせる
- challenge は短時間で失効させ、一度だけ利用可能にする
- 招待トークンは十分長いランダム値を使う
- 招待トークンの平文をDBに保存しない
- 認証Cookieは HttpOnly / Secure を必須とする
- CSRF、XSS、SQL Injection を考慮する
- D1 クエリは必ずバインドパラメータを使用する
- すべての更新APIでサーバー側の認可を行う
- ログイン・招待・WebAuthn関連APIには必要に応じて Rate Limit を設定する
- 削除操作など重要操作について監査可能性を確保する

---

## 21. 初版で実装しないもの

以下は初版スコープ外とする。

- 一般公開
- 公開ユーザー登録
- パスワード認証
- OAuth / Google ログイン等
- メールによる自動招待送信
- カバー画像
- 挿絵
- EPUB
- PDF
- R2連携
- 高度な全文検索
- SNS機能
- いいね
- フォロー
- DM
- コメントのスレッド化
- リアルタイム通知
- 汎用RBACシステム
- マイクロサービス化

---

## 22. 初版の画面

最低限、以下の画面を想定する。

### 未認証

- ログイン
- 招待受諾 / パスキー登録

### 共通

- ホーム
- 自分のプロフィール
- パスキー管理
- 講座一覧
- 講座詳細
- 小説一覧
- 小説詳細

### 生徒

- 講座参加申請
- 小説新規投稿
- 小説編集
- 小説削除
- 修正履歴確認

### 講師

- 講座作成
- 講座編集
- 参加申請管理
- 生徒招待
- 課題管理
- お知らせ管理
- 小説へのコメント

### 管理者

- ユーザー一覧
- ユーザー編集
- 招待管理
- 講師資格管理
- 管理者権限管理
- 全講座管理

---

## 23. 実装優先順位

### Phase 1: 基盤

1. Cloudflare Workers + Hono プロジェクト作成
2. React/Vite フロントエンド
3. D1 接続
4. migration
5. users
6. passkeys
7. invitations
8. セッション管理
9. Passkey 登録・ログイン

### Phase 2: 講座

1. courses
2. course_memberships
3. 講座作成
4. 講座編集
5. 生徒招待
6. 参加申請
7. 承認・拒否

### Phase 3: 小説

1. novels
2. tags
3. novel_tags
4. 投稿
5. 閲覧
6. 編集
7. revision
8. 論理削除
9. visibility

### Phase 4: 講師機能

1. comments
2. assignments
3. announcements

### Phase 5: 運用

1. 管理者画面
2. パスキー復旧
3. バックアップ
4. セキュリティ確認
5. ログ・監査

---

## 24. Claude Code への実装指示

Claude Code は以下を守ること。

1. この仕様書を実装上の正とする。
2. 仕様にない機能を勝手に追加しない。
3. 初版ではシンプルさを優先する。
4. 汎用RBACや不要なRepository/Service層など、規模に対して過剰な抽象化を導入しない。
5. ただし認証・認可・WebAuthn・セッション処理は適切にモジュール分離する。
6. 認可チェックはサーバー側で必ず実施する。
7. D1 の migration をソース管理する。
8. DBスキーマ変更時は既存 migration を書き換えず、新しい migration を追加する。
9. TypeScript の型安全性を維持する。
10. `any` の使用は原則避ける。
11. セキュリティ上重要な処理にはテストを作成する。
12. 特に以下の認可テストを優先する。
    - 他人の小説を編集できない
    - 他人の小説を削除できない
    - 別講座の講師が操作できない
    - pending の生徒が講座内データを閲覧できない
    - visibility が正しく機能する
    - 非管理者が管理APIを利用できない
13. Passkey 認証処理は独自暗号実装を避け、実績のある WebAuthn ライブラリを使用する。
14. Cloudflare Workers 上で利用可能な API の範囲を前提とする。
15. 初版完成までは R2 対応を実装しない。

---

## 25. 設計上の重要事項

### ユーザー種別を固定 role にしない

以下は採用しない。

```text
users.role = admin / instructor / student
```

代わりに、

```text
users.is_admin
users.can_teach

course_memberships.role
course_memberships.status
```

を使う。

これにより、

- 管理者兼講師
- 講師兼生徒
- 講座Aでは講師、講座Bでは生徒

を自然に表現できる。

### 小説の可視性は必ず講座との関係を確認する

`course_students` を単に「student role のユーザー全員」と解釈してはいけない。

対象小説の `course_id` と同じ講座に active membership があるユーザーのみ閲覧可能とする。

### 管理者は例外として全権限を持つ

認可処理では最初に管理者判定を行ってよい。

ただし、管理者による操作についても重要操作は記録可能な構造を保つ。

---

## 26. 今後の拡張候補

初版完成後に必要性を確認してから検討する。

- R2 を用いた画像・EPUB・PDF
- メール招待
- 全文検索
- 講座年度・期間
- 課題と小説提出の紐付け
- 通知
- コメント返信
- 操作履歴
- CSVエクスポート
- EPUB生成
- 一般公開機能

これらは初版の実装には含めない。
