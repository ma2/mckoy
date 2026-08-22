import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCourse } from '../lib/courses';

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
    <main className="centered">
      <h1>新しい講座を作成</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label>
          講座名
          <br />
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          説明
          <br />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button type="submit" disabled={pending}>
          作成
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
