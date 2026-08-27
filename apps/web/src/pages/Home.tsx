import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** ログイン後のトップ画面。自分の権限（管理者/講師資格）と、主要機能への導線を表示する。 */
export default function Home() {
  const { state } = useAuth();

  if (state.status !== 'authenticated') return null;
  const { user } = state;
  const canCreateCourse = user.isAdmin || user.canTeach;

  return (
    <main className="page">
      <h1>ようこそ、{user.name} さん</h1>
      <div className="card">
        <p style={{ marginBottom: 'var(--space-2)' }}>{user.email}</p>
        <span className="badge" style={{ marginRight: 'var(--space-2)' }}>
          管理者: {user.isAdmin ? 'はい' : 'いいえ'}
        </span>
        <span className="badge">講師資格: {user.canTeach ? 'はい' : 'いいえ'}</span>
      </div>

      <ul className="entry-list">
        <li className="entry-list__item">
          <Link to="/courses">講座一覧</Link>
          <p className="entry-list__meta">
            {canCreateCourse
              ? '講座を確認したり、新しい講座を作成します。'
              : '参加中の講座を確認したり、新しい講座に参加申請します。'}
          </p>
        </li>
        {user.isAdmin && (
          <li className="entry-list__item">
            <Link to="/admin/users">ユーザー管理</Link>
            <p className="entry-list__meta">登録済みユーザーの講師資格・管理者権限を管理します。</p>
          </li>
        )}
        {user.isAdmin && (
          <li className="entry-list__item">
            <Link to="/admin/deleted-novels">削除済み小説</Link>
            <p className="entry-list__meta">論理削除された小説を確認します。</p>
          </li>
        )}
        {user.isAdmin && (
          <li className="entry-list__item">
            <Link to="/admin/invitations">招待管理</Link>
            <p className="entry-list__meta">講座に紐付かない招待（管理者・講師資格の付与）を発行・管理します。</p>
          </li>
        )}
        <li className="entry-list__item">
          <Link to="/passkeys">パスキー管理</Link>
          <p className="entry-list__meta">ログインに使うパスキーの追加・削除ができます。</p>
        </li>
      </ul>
    </main>
  );
}
