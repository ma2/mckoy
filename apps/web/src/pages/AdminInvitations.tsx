import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { createGlobalInvitation } from '../lib/admin';

/** 管理者専用の招待発行画面（講座に紐付かない、管理者・講師資格の付与）。仕様書 §22 の管理者画面「招待管理」。 */
export default function AdminInvitations() {
  const { state } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [canTeach, setCanTeach] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'authenticated' || !state.user.isAdmin) {
    return (
      <main className="centered">
        <p className="error">管理者のみ利用できます。</p>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInvitationUrl(null);
    try {
      const { invitationUrl } = await createGlobalInvitation({ name, email, isAdmin, canTeach });
      setInvitationUrl(invitationUrl);
      setName('');
      setEmail('');
      setIsAdmin(false);
      setCanTeach(false);
    } catch {
      setError('招待の作成に失敗しました。');
    }
  }

  return (
    <main className="centered">
      <h1>招待管理</h1>
      <p>
        講座に紐付かない招待（管理者・講師資格）を発行します。生徒を特定の講座に招待する場合は、
        その講座の詳細ページから招待してください。
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label>
          氏名
          <br />
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          メールアドレス
          <br />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <input type="checkbox" checked={canTeach} onChange={(e) => setCanTeach(e.target.checked)} /> 講師資格
          （can_teach）を付与
        </label>
        <label>
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> 管理者権限を付与
        </label>
        <button type="submit">招待URLを発行</button>
      </form>
      {error && <p className="error">{error}</p>}
      {invitationUrl && (
        <p>
          招待URL: <code>{invitationUrl}</code>
        </p>
      )}
      <p>
        <Link to="/">ホームへ戻る</Link>
      </p>
    </main>
  );
}
