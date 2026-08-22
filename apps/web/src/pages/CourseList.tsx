import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { listCourses, joinCourse, type Course } from '../lib/courses';

export default function CourseList() {
  const { state } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const result = await listCourses();
    setCourses(result.courses);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleJoin(courseId: string) {
    setMessage(null);
    try {
      await joinCourse(courseId);
      setMessage('参加申請を送信しました。講師の承認をお待ちください。');
    } catch {
      setMessage('参加申請に失敗しました（既に申請済みの可能性があります）。');
    }
  }

  const canCreate = state.status === 'authenticated' && (state.user.isAdmin || state.user.canTeach);

  return (
    <main className="centered">
      <h1>講座一覧</h1>
      {canCreate && (
        <p>
          <Link to="/courses/new">新しい講座を作成</Link>
        </p>
      )}
      {message && <p>{message}</p>}
      <ul>
        {courses.map((course) => (
          <li key={course.id}>
            <Link to={`/courses/${course.id}`}>{course.name}</Link>{' '}
            <button onClick={() => handleJoin(course.id)}>参加申請</button>
          </li>
        ))}
      </ul>
      <p>
        <Link to="/">ホームへ戻る</Link>
      </p>
    </main>
  );
}
