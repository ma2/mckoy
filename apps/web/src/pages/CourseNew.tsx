import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import { createCourse } from '../lib/courses';

/** 講座作成画面。作成すると自動的にその講座のactive講師になる（routes/courses.ts 参照）。 */
export default function CourseNew() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { course } = await createCourse({ name, description: description || null });
      navigate(`/courses/${course.id}`, { replace: true });
    } catch {
      setError('作成に失敗しました（講座名が重複している可能性があります）。');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: 'ホーム', to: '/' },
          { label: '講座一覧', to: '/courses' },
          { label: '新しい講座を作成' },
        ]}
      />
      <h1>新しい講座を作成</h1>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label className="field">
            講座名
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            説明
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={pending}>
            作成
          </button>
        </form>
      </div>
    </main>
  );
}
