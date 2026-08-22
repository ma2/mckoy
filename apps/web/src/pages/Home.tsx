import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

export default function Home() {
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
    <main className="centered">
      <h1>ようこそ、{user.name} さん</h1>
      <ul>
        <li>メール: {user.email}</li>
        <li>管理者: {user.isAdmin ? 'はい' : 'いいえ'}</li>
        <li>講師資格: {user.canTeach ? 'はい' : 'いいえ'}</li>
      </ul>
      <p>
        <Link to="/passkeys">パスキー管理</Link>
      </p>
      <p>
        <Link to="/courses">講座一覧</Link>
      </p>
      {user.isAdmin && (
        <p>
          <Link to="/admin/invitations">招待管理</Link>
        </p>
      )}
      <button onClick={handleLogout}>ログアウト</button>
    </main>
  );
}
