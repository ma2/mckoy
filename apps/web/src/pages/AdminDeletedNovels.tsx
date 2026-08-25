import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import { useAuth } from '../lib/auth';
import { listDeletedNovels, type DeletedNovel } from '../lib/admin';

/** 管理者専用の削除済み小説一覧画面（仕様書 §12「管理者は必要に応じて削除済み小説を確認できる」、issue #45）。 */
export default function AdminDeletedNovels() {
  const { state } = useAuth();
  const [novels, setNovels] = useState<DeletedNovel[]>([]);
  const isAdmin = state.status === 'authenticated' && state.user.isAdmin;

  useEffect(() => {
    if (!isAdmin) return;
    listDeletedNovels().then((result) => setNovels(result.novels));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <main className="page">
        <p className="error">管理者のみ利用できます。</p>
      </main>
    );
  }

  return (
    <main className="page">
      <Breadcrumb items={[{ label: 'ホーム', to: '/' }, { label: '削除済み小説' }]} />
      <h1>削除済み小説</h1>
      {novels.length === 0 ? (
        <p className="empty-state">削除済みの小説はありません。</p>
      ) : (
        <ul className="entry-list">
          {novels.map((n) => (
            <li key={n.id} className="entry-list__item">
              <h3>
                <Link to={`/novels/${n.id}`}>{n.title}</Link>
              </h3>
              <p className="entry-list__meta">
                {n.authorName} ・{' '}
                <Link to={`/courses/${n.courseId}`}>{n.courseName}</Link> ・ 削除日時: {n.deletedAt}
                {n.deletedByName && <> ・ 削除者: {n.deletedByName}</>}
              </p>
              {n.deletionComment && <p style={{ margin: 0 }}>{n.deletionComment}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
