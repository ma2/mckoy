import { useEffect, useState } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { addPasskey } from '../lib/webauthn';
import {
  listUsers,
  listUserPasskeys,
  deleteUserPasskey,
  createPasskeyResetInvitation,
  type AdminUser,
  type AdminPasskey,
} from '../lib/admin';

type Passkey = { id: string; name: string | null; createdAt: string; lastUsedAt: string | null };

/** 自分のパスキー管理画面。一覧・追加・削除ができる（仕様書 §7）。管理者のみ、手動復旧用に他ユーザーのパスキーも管理できる（仕様書 §7.1）。 */
export default function Passkeys() {
  const { state } = useAuth();
  const isAdmin = state.status === 'authenticated' && state.user.isAdmin;
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [targetPasskeys, setTargetPasskeys] = useState<AdminPasskey[]>([]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [resetInvitationUrl, setResetInvitationUrl] = useState<string | null>(null);

  async function load() {
    const result = await api.get<{ passkeys: Passkey[] }>('/me/passkeys');
    setPasskeys(result.passkeys);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    listUsers().then((result) => setUsers(result.users));
  }, [isAdmin]);

  async function loadTargetPasskeys(userId: string) {
    if (!userId) {
      setTargetPasskeys([]);
      return;
    }
    const result = await listUserPasskeys(userId);
    setTargetPasskeys(result.passkeys);
  }

  async function handleAdd() {
    setError(null);
    try {
      await addPasskey();
      await load();
    } catch {
      setError('パスキーの追加に失敗しました。');
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.delete(`/me/passkeys/${id}`);
      await load();
    } catch {
      setError('削除できませんでした（最後の1件は削除できません）。');
    }
  }

  async function handleDeleteTargetPasskey(id: string) {
    setAdminError(null);
    try {
      await deleteUserPasskey(selectedUserId, id);
      await loadTargetPasskeys(selectedUserId);
    } catch {
      setAdminError('失効に失敗しました。');
    }
  }

  async function handleIssueResetInvitation() {
    setAdminError(null);
    setResetInvitationUrl(null);
    try {
      const { invitationUrl } = await createPasskeyResetInvitation(selectedUserId);
      setResetInvitationUrl(invitationUrl);
    } catch {
      setAdminError('招待URLの発行に失敗しました。');
    }
  }

  return (
    <main className="page">
      <Breadcrumb items={[{ label: 'ホーム', to: '/' }, { label: 'パスキー管理' }]} />
      <h1>パスキー管理</h1>
      {error && <p className="error">{error}</p>}
      {passkeys.length === 0 ? (
        <p className="empty-state">登録済みのパスキーはありません。</p>
      ) : (
        <ul className="entry-list">
          {passkeys.map((p) => (
            <li key={p.id} className="entry-list__item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>{p.name ?? '(名前未設定)'}</h3>
                <p className="entry-list__meta">登録日: {p.createdAt}</p>
              </div>
              {passkeys.length > 1 && (
                <button className="btn-danger" onClick={() => handleDelete(p.id)}>
                  削除
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button onClick={handleAdd}>パスキーを追加</button>

      {isAdmin && (
        <div className="card" style={{ marginTop: 'var(--space-6)' }}>
          <h2 style={{ marginTop: 0 }}>ユーザーのパスキー管理（手動復旧用）</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            パスキーをすべて失ったユーザーについて、既存パスキーを失効させた上で下の
            「再登録用の招待URLを発行」から招待URLを発行してください（仕様書 §7.1）。
            このURLで登録すると、新しいアカウントではなく既存のアカウントにパスキーが
            追加されるため、講座membershipや投稿済みの小説はそのまま引き継がれます。
          </p>
          <label className="field">
            対象ユーザー
            <select
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setResetInvitationUrl(null);
                loadTargetPasskeys(e.target.value);
              }}
            >
              <option value="">選択してください</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}（{u.email}）
                </option>
              ))}
            </select>
          </label>
          {adminError && <p className="error">{adminError}</p>}
          {selectedUserId &&
            (targetPasskeys.length === 0 ? (
              <p className="empty-state">このユーザーのパスキーはありません。</p>
            ) : (
              <ul className="entry-list">
                {targetPasskeys.map((p) => (
                  <li
                    key={p.id}
                    className="entry-list__item"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <h3>{p.name ?? '(名前未設定)'}</h3>
                      <p className="entry-list__meta">登録日: {p.createdAt}</p>
                    </div>
                    <button className="btn-danger" onClick={() => handleDeleteTargetPasskey(p.id)}>
                      失効
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          {selectedUserId && (
            <>
              <button onClick={handleIssueResetInvitation} style={{ marginTop: 'var(--space-4)' }}>
                再登録用の招待URLを発行
              </button>
              {resetInvitationUrl && (
                <p className="notice" style={{ marginTop: 'var(--space-4)' }}>
                  招待URL: <code>{resetInvitationUrl}</code>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
