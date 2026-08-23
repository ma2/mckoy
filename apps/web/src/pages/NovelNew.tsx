import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createNovel, type NovelVisibility } from '../lib/novels';

/** 小説投稿画面。タグはカンマ区切りで入力させ、送信時に配列へ分割する。公開範囲の初期値は仕様書どおり「講師のみ」。 */
export default function NovelNew() {
  const { id: courseId } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [plot, setPlot] = useState('');
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
        plot,
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
    <main className="page">
      <h1>小説を投稿</h1>
      <div className="card">
        <form onSubmit={handleSubmit}>
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
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例: ファンタジー, 短編" />
          </label>
          <label className="field">
            公開範囲
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as NovelVisibility)}>
              <option value="instructors">講師のみ</option>
              <option value="course_students">講座メンバー</option>
              <option value="all_users">全員</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={pending}>
            投稿
          </button>
        </form>
      </div>
    </main>
  );
}
