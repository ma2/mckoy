import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithPasskey } from '../lib/webauthn';
import { useAuth } from '../lib/auth';

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
      <h1>Mckoy</h1>
      <button onClick={handleLogin} disabled={pending}>
        パスキーでログイン
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
