import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { deleteNovel, getNovel, listRevisions, updateNovel, type Novel, type NovelVisibility, type Revision } from '../lib/novels';

const visibilityLabel: Record<string, string> = {
  instructors: '講師のみ',
  course_students: '講座メンバー',
  all_users: '全員',
};

export default function NovelDetail() {
  const { id } = useParams<{ id: string }>();
  const { state } = useAuth();
  const navigate = useNavigate();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<NovelVisibility>('instructors');
  const [deleteComment, setDeleteComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const { novel } = await getNovel(id);
      setNovel(novel);
      setTitle(novel.title);
      setBody(novel.body);
      setTags(novel.tags.join(', '));
      setVisibility(novel.visibility);
      const { revisions } = await listRevisions(id);
      setRevisions(revisions);
    } catch {
      setNotFound(true);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const currentUser = state.status === 'authenticated' ? state.user : null;
  const isAuthor = novel !== null && currentUser !== null && novel.authorId === currentUser.id;
  const canDelete = isAuthor || (currentUser?.isAdmin ?? false);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    try {
      const { novel } = await updateNovel(id, {
        title,
        body,
        visibility,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      });
      setNovel(novel);
      const { revisions } = await listRevisions(id);
      setRevisions(revisions);
    } catch {
      setError('更新に失敗しました。');
    }
  }

  async function handleDelete() {
    if (!id || !novel) return;
    setError(null);
    try {
      await deleteNovel(id, deleteComment || undefined);
      navigate(`/courses/${novel.courseId}/novels`, { replace: true });
    } catch {
      setError('削除に失敗しました。');
    }
  }

  if (notFound) {
    return (
      <main className="centered">
        <p className="error">見つからないか、閲覧権限がありません。</p>
      </main>
    );
  }

  if (!novel) {
    return (
      <main className="centered">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="centered">
      <h1>{novel.title}</h1>
      <p>
        公開範囲: {visibilityLabel[novel.visibility]}
        {novel.tags.length > 0 && <> / タグ: {novel.tags.join(', ')}</>}
      </p>
      {error && <p className="error">{error}</p>}

      {!isAuthor && <p style={{ whiteSpace: 'pre-wrap' }}>{novel.body}</p>}

      {isAuthor && (
        <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label>
            タイトル
            <br />
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            本文
            <br />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} required />
          </label>
          <label>
            タグ（カンマ区切り）
            <br />
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label>
            公開範囲
            <br />
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as NovelVisibility)}>
              <option value="instructors">講師のみ</option>
              <option value="course_students">講座メンバー</option>
              <option value="all_users">全員</option>
            </select>
          </label>
          <button type="submit">更新</button>
        </form>
      )}

      {canDelete && (
        <div>
          <label>
            削除コメント（任意）
            <br />
            <input value={deleteComment} onChange={(e) => setDeleteComment(e.target.value)} />
          </label>
          <br />
          <button onClick={handleDelete}>削除</button>
        </div>
      )}

      <h2>改訂履歴</h2>
      <ul>
        {revisions.map((r) => (
          <li key={r.id}>
            {r.createdAt} — {r.title}
            {r.revisionComment && <>（{r.revisionComment}）</>}
          </li>
        ))}
      </ul>

      <p>
        <Link to={`/courses/${novel.courseId}/novels`}>小説一覧へ戻る</Link>
      </p>
    </main>
  );
}
