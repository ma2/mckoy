import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { registerPasskeyForInvitation } from '../lib/webauthn';
import { useAuth } from '../lib/auth';

type InvitationInfo = { name: string; email: string };

export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    if (!token) return;
    api
      .get<InvitationInfo>(`/invitations/${token}`)
      .then(setInvitation)
      .catch(() => setError('招待が見つからないか、期限切れです。'));
  }, [token]);

  async function handleRegister() {
    if (!token) return;
    setError(null);
    setPending(true);
    try {
      await registerPasskeyForInvitation(token);
      await refresh();
      navigate('/', { replace: true });
    } catch {
      setError('パスキーの登録に失敗しました。');
    } finally {
      setPending(false);
    }
  }

  if (error) {
    return (
      <main className="centered">
        <p className="error">{error}</p>
      </main>
    );
  }

  if (!invitation) {
    return (
      <main className="centered">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="centered">
      <h1>招待の確認</h1>
      <p>氏名: {invitation.name}</p>
      <p>メール: {invitation.email}</p>
      <button onClick={handleRegister} disabled={pending}>
        パスキーを登録
      </button>
    </main>
  );
}
