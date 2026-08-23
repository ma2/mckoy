import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import { useAuth } from '../lib/auth';
import { getCourse, getMyMembership, type Course } from '../lib/courses';
import { listAssignments, createAssignment, type Assignment } from '../lib/assignments';

/** 講座内の課題一覧・作成画面。作成フォームはその講座のactive講師/管理者のみ表示する。 */
export default function CourseAssignments() {
  const { id: courseId } = useParams<{ id: string }>();
  const { state } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentUser = state.status === 'authenticated' ? state.user : null;

  async function load() {
    if (!courseId) return;
    const { course } = await getCourse(courseId);
    setCourse(course);
    const { assignments } = await listAssignments(courseId);
    setAssignments(assignments);
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
      await createAssignment(courseId, { title, body, dueAt: dueAt || null });
      setTitle('');
      setBody('');
      setDueAt('');
      await load();
    } catch {
      setError('作成に失敗しました。');
    }
  }

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: 'ホーム', to: '/' },
          { label: '講座一覧', to: '/courses' },
          { label: course?.name ?? '講座', to: `/courses/${courseId}` },
          { label: '課題' },
        ]}
      />
      <h1>課題</h1>
      {error && <p className="error">{error}</p>}
      {assignments.length === 0 ? (
        <p className="empty-state">まだ課題はありません。</p>
      ) : (
        <ul className="entry-list">
          {assignments.map((a) => (
            <li key={a.id} className="entry-list__item">
              <h3>{a.title}</h3>
              {a.dueAt && (
                <p className="entry-list__meta">
                  締切: <span className="badge badge-accent">{a.dueAt}</span>
                </p>
              )}
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{a.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>課題を作成</h2>
          <form onSubmit={handleCreate}>
            <label className="field">
              タイトル
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="field">
              内容
              <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
            </label>
            <label className="field">
              締切（任意）
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </label>
            <button type="submit">作成</button>
          </form>
        </div>
      )}
    </main>
  );
}
