import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

/** 認証済みページ共通のヘッダー。ロゴ・主要ナビゲーション・ログアウトを常設する。 */
export default function AppHeader() {
  const { state, refresh } = useAuth();
  const navigate = useNavigate();

  if (state.status !== 'authenticated') return null;
  const { user } = state;

  async function handleLogout() {
    await api.post('/auth/logout');
    await refresh();
    navigate('/login', { replace: true });
  }

  return (
    <header className="app-header">
      <Link to="/" className="app-header__brand">
        <img src="/logo.svg" alt="" width={28} height={28} />
        <span>Mckoy</span>
      </Link>
      <div className="app-header__user">
        <Link to="/">{user.name} さん</Link>
        <button className="btn-secondary" onClick={handleLogout}>
          ログアウト
        </button>
      </div>
    </header>
  );
}
