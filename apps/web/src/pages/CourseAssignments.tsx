import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getMyMembership } from '../lib/courses';
import { listAssignments, createAssignment, type Assignment } from '../lib/assignments';

export default function CourseAssignments() {
  const { id: courseId } = useParams<{ id: string }>();
  const { state } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentUser = state.status === 'authenticated' ? state.user : null;

  async function load() {
    if (!courseId) return;
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
    <main className="centered">
      <h1>課題</h1>
      {error && <p className="error">{error}</p>}
      <ul>
        {assignments.map((a) => (
          <li key={a.id}>
            <strong>{a.title}</strong>
            {a.dueAt && <> （締切: {a.dueAt}）</>}
            <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
          </li>
        ))}
      </ul>
      {canManage && (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h2>課題を作成</h2>
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
          <label>
            締切（任意）
            <br />
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
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
