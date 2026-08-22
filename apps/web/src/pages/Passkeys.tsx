import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
    <main className="centered">
      <h1>パスキー管理</h1>
      <ul>
        {passkeys.map((p) => (
          <li key={p.id}>
            {p.name ?? '(名前未設定)'} — 登録日: {p.createdAt}{' '}
            <button onClick={() => handleDelete(p.id)}>削除</button>
          </li>
        ))}
      </ul>
      <button onClick={handleAdd}>パスキーを追加</button>
      {error && <p className="error">{error}</p>}
      <p>
        <Link to="/">ホームへ戻る</Link>
      </p>
    </main>
  );
}
