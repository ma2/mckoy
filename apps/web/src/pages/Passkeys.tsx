import { useEffect, useState } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import { api } from '../lib/api';
import { addPasskey } from '../lib/webauthn';

type Passkey = { id: string; name: string | null; createdAt: string; lastUsedAt: string | null };

/** 自分のパスキー管理画面。一覧・追加・削除ができる（仕様書 §7）。 */
export default function Passkeys() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const result = await api.get<{ passkeys: Passkey[] }>('/me/passkeys');
    setPasskeys(result.passkeys);
  }

  useEffect(() => {
    load();
  }, []);

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
              <button className="btn-danger" onClick={() => handleDelete(p.id)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={handleAdd}>パスキーを追加</button>
    </main>
  );
}
