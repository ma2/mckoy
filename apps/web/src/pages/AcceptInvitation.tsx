import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { registerPasskeyForInvitation } from '../lib/webauthn';
import { useAuth } from '../lib/auth';

type InvitationInfo = {
  name: string;
  email: string;
  course: { id: string; name: string } | null;
  isPasskeyReset: boolean;
};

/** 招待受諾画面。招待内容（氏名・メール・対象講座）を表示し、パスキー登録で新規アカウントを作成する（仕様書 §5.5）。 */
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
        <img src="/logo.svg" alt="" width={56} height={56} />
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
      <img src="/logo.svg" alt="" width={56} height={56} />
      <h1>招待の確認</h1>
      <div className="card" style={{ width: '100%', textAlign: 'left' }}>
        <p>
          氏名: <strong>{invitation.name}</strong>
        </p>
        <p>
          メール: <strong>{invitation.email}</strong>
        </p>
        {invitation.isPasskeyReset && (
          <p className="notice">
            パスキーの再登録です。登録すると、既存のアカウントに新しいパスキーが追加されます
            （新しいアカウントは作成されません）。
          </p>
        )}
        {invitation.course && (
          <p className="notice">
            「{invitation.course.name}」講座への招待です。登録すると、この講座のメンバーとして参加します。
          </p>
        )}
        <button onClick={handleRegister} disabled={pending} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
          パスキーを登録
        </button>
      </div>
    </main>
  );
}
