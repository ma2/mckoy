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
    <main className="centered">
      <h1>お知らせ</h1>
      {error && <p className="error">{error}</p>}
      <ul>
        {announcements.map((a) => (
          <li key={a.id}>
            <strong>{a.title}</strong>
            <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
          </li>
        ))}
      </ul>
      {canManage && (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h2>お知らせを作成</h2>
          <label>
            タイトル
            <br />
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            内容
            <br />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
          </label>
          <button type="submit">作成</button>
        </form>
      )}
      <p>
        <Link to={`/courses/${courseId}`}>講座詳細へ戻る</Link>
      </p>
    </main>
  );
}
