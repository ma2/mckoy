import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import { useAuth } from '../lib/auth';
import { deleteNovel, getNovel, listRevisions, updateNovel, type Novel, type NovelVisibility, type Revision } from '../lib/novels';
import { listComments, createComment, type Comment } from '../lib/comments';
import { getCourse, getMyMembership, type Course } from '../lib/courses';

const visibilityLabel: Record<string, string> = {
  instructors: '講師のみ',
  course_students: '講座メンバー',
  all_users: '全員',
};

/**
 * 小説詳細画面。作者本人だけが本文の編集フォームを見る（他人には本文をそのまま表示）。
 * 削除ボタンは作者本人または管理者。コメント投稿フォームは対象講座のactive講師/管理者のみ。
 * 改訂履歴・コメントは常に画面下部に表示する（別ルートは作らず1画面にまとめている）。
 */
export default function NovelDetail() {
  const { id } = useParams<{ id: string }>();
  const { state } = useAuth();
  const navigate = useNavigate();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [plot, setPlot] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<NovelVisibility>('instructors');
  const [updateComment, setUpdateComment] = useState('');
  const [deleteComment, setDeleteComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [canComment, setCanComment] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const { novel } = await getNovel(id);
      setNovel(novel);
      const { course } = await getCourse(novel.courseId);
      setCourse(course);
      setTitle(novel.title);
      setBody(novel.body);
      setPlot(novel.plot ?? '');
      setTags(novel.tags.join(', '));
      setVisibility(novel.visibility);
      const { revisions } = await listRevisions(id);
      setRevisions(revisions);
      const { comments } = await listComments(id);
      setComments(comments);
      const { membership } = await getMyMembership(novel.courseId);
      setCanComment(
        currentUser?.isAdmin === true || (membership?.role === 'instructor' && membership.status === 'active'),
      );
    } catch {
      setNotFound(true);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    try {
      await createComment(id, newComment);
      setNewComment('');
      const { comments } = await listComments(id);
      setComments(comments);
    } catch {
      setError('コメントの投稿に失敗しました。');
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
        plot,
        visibility,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
        revisionComment: updateComment || undefined,
      });
      setNovel(novel);
      setUpdateComment('');
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
      <main className="page">
        <p className="error">見つからないか、閲覧権限がありません。</p>
      </main>
    );
  }

  if (!novel) {
    return (
      <main className="page">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: 'ホーム', to: '/' },
          { label: '講座一覧', to: '/courses' },
          { label: course?.name ?? '講座', to: `/courses/${novel.courseId}` },
          { label: '小説一覧', to: `/courses/${novel.courseId}/novels` },
          { label: novel.title },
        ]}
      />
      <h1>{novel.title}</h1>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <span className="badge" style={{ marginRight: 'var(--space-2)' }}>
          {visibilityLabel[novel.visibility]}
        </span>
        {novel.tags.map((tag) => (
          <span className="badge badge-accent" key={tag} style={{ marginRight: 'var(--space-2)' }}>
            {tag}
          </span>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {!isAuthor && (
        <>
          {novel.plot && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>プロット</h2>
              <div style={{ whiteSpace: 'pre-wrap' }}>{novel.plot}</div>
            </div>
          )}
          <div className="card" style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', whiteSpace: 'pre-wrap' }}>
            {novel.body}
          </div>
        </>
      )}

      {isAuthor && (
        <div className="card">
          <form onSubmit={handleUpdate}>
            <label className="field">
              タイトル
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="field">
              本文（任意）
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} />
            </label>
            <label className="field">
              プロット（任意）
              <textarea value={plot} onChange={(e) => setPlot(e.target.value)} rows={6} />
            </label>
            <label className="field">
              タグ（カンマ区切り）
              <input value={tags} onChange={(e) => setTags(e.target.value)} />
            </label>
            <label className="field">
              公開範囲
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as NovelVisibility)}>
                <option value="instructors">講師のみ</option>
                <option value="course_students">講座メンバー</option>
                <option value="all_users">全員</option>
              </select>
            </label>
            <label className="field">
              更新コメント（任意）
              <input value={updateComment} onChange={(e) => setUpdateComment(e.target.value)} />
            </label>
            <button type="submit">更新</button>
          </form>
        </div>
      )}

      {canDelete && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <label className="field">
            削除コメント（任意）
            <input value={deleteComment} onChange={(e) => setDeleteComment(e.target.value)} />
          </label>
          <button className="btn-danger" onClick={handleDelete}>
            この小説を削除
          </button>
        </div>
      )}

      <h2>改訂履歴</h2>
      {revisions.length === 0 ? (
        <p className="empty-state">改訂履歴はありません。</p>
      ) : (
        <ul className="entry-list">
          {revisions.map((r) => (
            <li key={r.id} className="entry-list__item">
              <p className="entry-list__meta">{r.createdAt}</p>
              <h3>{r.title}</h3>
              {r.revisionComment && <p>{r.revisionComment}</p>}
            </li>
          ))}
        </ul>
      )}

      <h2>コメント</h2>
      {comments.length === 0 ? (
        <p className="empty-state">まだコメントはありません。</p>
      ) : (
        <ul className="entry-list">
          {comments.map((c) => (
            <li key={c.id} className="entry-list__item">
              <p className="entry-list__meta">
                {c.userName} ・ {c.createdAt}
              </p>
              <p style={{ margin: 0 }}>{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <div className="card">
          <form onSubmit={handleAddComment}>
            <label className="field">
              コメント
              <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} required />
            </label>
            <button type="submit">コメントを投稿</button>
          </form>
        </div>
      )}
    </main>
  );
}
