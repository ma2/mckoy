import { useCallback, useEffect, useState } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import { useAuth } from '../lib/auth';
import { listUsers, updateUser, type AdminUser } from '../lib/admin';

/**
 * 管理者専用のユーザー一覧・編集画面（仕様書 §22「ユーザー一覧」「ユーザー編集」
 * 「講師資格管理」「管理者権限管理」、issue #43）。
 *
 * 講師資格（can_teach）は付与・はく奪の両方をこの画面から行える。管理者権限
 * （is_admin）は付与のみ行える — 悪意ある管理者による乗っ取りを防ぐため、はく奪は
 * Web経由では不可で、運用スクリプト（`npm run revoke:admin`）でのみ実施する。
 */
export default function AdminUsers() {
  const { state, refresh } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = state.status === 'authenticated' && state.user.isAdmin;
  const myId = state.status === 'authenticated' ? state.user.id : null;

  const loadUsers = useCallback(async () => {
    const result = await listUsers();
    setUsers(result.users);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
  }, [isAdmin, loadUsers]);

  if (!isAdmin) {
    return (
      <main className="page">
        <p className="error">管理者のみ利用できます。</p>
      </main>
    );
  }

  async function apply(user: AdminUser, params: { isAdmin?: boolean; canTeach?: boolean }) {
    setError(null);
    setBusyId(user.id);
    try {
      await updateUser(user.id, params);
      await loadUsers();
      // 自分自身の権限を変えた場合はヘッダー・ホーム等の表示も更新する。
      if (user.id === myId) await refresh();
    } catch {
      setError(`${user.name} の権限更新に失敗しました。`);
    } finally {
      setBusyId(null);
    }
  }

  function handleGrantAdmin(user: AdminUser) {
    if (!window.confirm(`${user.name} に管理者権限を付与します。付与後、Web画面からのはく奪はできません（スクリプトのみ）。よろしいですか？`)) {
      return;
    }
    apply(user, { isAdmin: true });
  }

  return (
    <main className="page">
      <Breadcrumb items={[{ label: 'ホーム', to: '/' }, { label: 'ユーザー管理' }]} />
      <h1>ユーザー管理</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        登録済みユーザーの講師資格・管理者権限を管理します。管理者権限のはく奪はこの画面からは
        できません（運用スクリプト <code>npm run revoke:admin</code> で行います）。
      </p>
      {error && <p className="error">{error}</p>}
      {users.length === 0 ? (
        <p className="empty-state">ユーザーがいません。</p>
      ) : (
        <ul className="entry-list">
          {users.map((u) => {
            const busy = busyId === u.id;
            return (
              <li key={u.id} className="entry-list__item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ marginBottom: 'var(--space-1)' }}>
                      {u.name}
                      {u.id === myId && <span style={{ color: 'var(--text-muted)' }}>（自分）</span>}
                    </h3>
                    <p className="entry-list__meta">{u.email}</p>
                    <span className="badge" style={{ marginRight: 'var(--space-2)' }}>
                      管理者: {u.isAdmin ? 'はい' : 'いいえ'}
                    </span>
                    <span className="badge">講師資格: {u.canTeach ? 'はい' : 'いいえ'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => apply(u, { canTeach: !u.canTeach })}
                    >
                      講師資格を{u.canTeach ? 'はく奪' : '付与'}
                    </button>
                    {u.isAdmin ? (
                      <span className="badge" title="管理者権限のはく奪はスクリプト（npm run revoke:admin）でのみ可能です">
                        管理者（はく奪はスクリプトのみ）
                      </span>
                    ) : (
                      <button className="btn-secondary" disabled={busy} onClick={() => handleGrantAdmin(u)}>
                        管理者権限を付与
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
