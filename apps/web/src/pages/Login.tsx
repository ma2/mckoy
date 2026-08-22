import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithPasskey } from '../lib/webauthn';
import { useAuth } from '../lib/auth';

/** ログイン画面。「パスキーでログイン」ボタンのみ（仕様書 §6、パスワード入力欄は設けない）。 */
export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function handleLogin() {
    setError(null);
    setPending(true);
    try {
      await loginWithPasskey();
      await refresh();
      navigate('/', { replace: true });
    } catch {
      setError('ログインに失敗しました。');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="centered">
      <img src="/logo.svg" alt="" width={64} height={64} />
      <h1>Mckoy</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: '-0.75rem' }}>小説創作講座のための招待制プラットフォーム</p>
      <div className="card" style={{ width: '100%' }}>
        <button onClick={handleLogin} disabled={pending} style={{ width: '100%' }}>
          パスキーでログイン
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
