import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createNovel, type NovelVisibility } from '../lib/novels';

export default function NovelNew() {
  const { id: courseId } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<NovelVisibility>('instructors');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    setError(null);
    setPending(true);
    try {
      const { novel } = await createNovel(courseId, {
        title,
        body,
        visibility,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      });
      navigate(`/novels/${novel.id}`, { replace: true });
    } catch {
      setError('投稿に失敗しました。');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="centered">
      <h1>小説を投稿</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
        <button type="submit" disabled={pending}>
          投稿
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
