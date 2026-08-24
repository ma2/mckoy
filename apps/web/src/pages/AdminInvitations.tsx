import { useEffect, useState } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import { useAuth } from '../lib/auth';
import { createGlobalInvitation, listGlobalInvitations, revokeGlobalInvitation, type GlobalInvitation } from '../lib/admin';
import { invitationStatus } from '../lib/invitationStatus';

/** 管理者専用の招待発行画面（講座に紐付かない、管理者・講師資格の付与）。仕様書 §22 の管理者画面「招待管理」。 */
export default function AdminInvitations() {
  const { state } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [canTeach, setCanTeach] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<GlobalInvitation[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const isAdminUser = state.status === 'authenticated' && state.user.isAdmin;

  async function loadInvitations() {
    const { invitations } = await listGlobalInvitations();
    setInvitations(invitations);
  }

  useEffect(() => {
    if (!isAdminUser) return;
    loadInvitations();
  }, [isAdminUser]);

  if (!isAdminUser) {
    return (
      <main className="page">
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
      await loadInvitations();
    } catch {
      setError('招待の作成に失敗しました。');
    }
  }

  async function handleRevoke(id: string) {
    setListError(null);
    try {
      await revokeGlobalInvitation(id);
      await loadInvitations();
    } catch {
      setListError('招待の失効に失敗しました。');
    }
  }

  return (
    <main className="page">
      <Breadcrumb items={[{ label: 'ホーム', to: '/' }, { label: '招待管理' }]} />
      <h1>招待管理</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        講座に紐付かない招待（管理者・講師資格）を発行します。生徒を特定の講座に招待する場合は、
        その講座の詳細ページから招待してください。
      </p>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label className="field">
            氏名
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            メールアドレス
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={canTeach} onChange={(e) => setCanTeach(e.target.checked)} />
            講師資格（can_teach）を付与
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            管理者権限を付与
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">招待URLを発行</button>
        </form>
        {invitationUrl && (
          <p className="notice" style={{ marginTop: 'var(--space-4)' }}>
            招待URL: <code>{invitationUrl}</code>
          </p>
        )}
      </div>

      <h2>発行済みの招待</h2>
      {listError && <p className="error">{listError}</p>}
      {invitations.length === 0 ? (
        <p className="empty-state">まだ招待はありません。</p>
      ) : (
        <ul className="entry-list">
          {invitations.map((inv) => {
            const status = invitationStatus(inv);
            return (
              <li
                key={inv.id}
                className="entry-list__item"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <h3>{inv.name}</h3>
                  <p className="entry-list__meta">{inv.email}</p>
                  <span className={status === '有効' ? 'badge badge-accent' : 'badge'}>{status}</span>
                  {inv.canTeach && (
                    <span className="badge" style={{ marginLeft: 'var(--space-2)' }}>
                      講師資格
                    </span>
                  )}
                  {inv.isAdmin && (
                    <span className="badge" style={{ marginLeft: 'var(--space-2)' }}>
                      管理者
                    </span>
                  )}
                </div>
                {status === '有効' && (
                  <button className="btn-danger" onClick={() => handleRevoke(inv.id)}>
                    失効
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
