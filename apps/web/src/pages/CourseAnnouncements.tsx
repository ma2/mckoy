import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getMyMembership } from '../lib/courses';
import { listAnnouncements, createAnnouncement, type Announcement } from '../lib/announcements';

/** 講座内のお知らせ一覧・作成画面。作成フォームはその講座のactive講師/管理者のみ表示する。 */
export default function CourseAnnouncements() {
  const { id: courseId } = useParams<{ id: string }>();
  const { state } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentUser = state.status === 'authenticated' ? state.user : null;

  async function load() {
    if (!courseId) return;
    const { announcements } = await listAnnouncements(courseId);
    setAnnouncements(announcements);
    const { membership } = await getMyMembership(courseId);
    setCanManage(
      currentUser?.isAdmin === true || (membership?.role === 'instructor' && membership.status === 'active'),
    );
  }

  useEffect(() => {
    load();
  }, [courseId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    setError(null);
    try {
      await createAnnouncement(courseId, { title, body });
      setTitle('');
      setBody('');
      await load();
    } catch {
      setError('作成に失敗しました。');
    }
  }

  return (
    <main className="page">
      <h1>お知らせ</h1>
      {error && <p className="error">{error}</p>}
      {announcements.length === 0 ? (
        <p className="empty-state">まだお知らせはありません。</p>
      ) : (
        <ul className="entry-list">
          {announcements.map((a) => (
            <li key={a.id} className="entry-list__item">
              <h3>{a.title}</h3>
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{a.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>お知らせを作成</h2>
          <form onSubmit={handleCreate}>
            <label className="field">
              タイトル
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="field">
              内容
              <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
            </label>
            <button type="submit">作成</button>
          </form>
        </div>
      )}
      <Link className="back-link" to={`/courses/${courseId}`}>
        講座詳細へ戻る
      </Link>
    </main>
  );
}
