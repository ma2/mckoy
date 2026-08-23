import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import { useAuth } from '../lib/auth';
import { listCourses, joinCourse, roleLabel, statusLabel, type Course } from '../lib/courses';

/** 講座一覧画面。誰でも閲覧・参加申請できる。「新しい講座を作成」は管理者/can_teachのみ表示（実際の可否はサーバー側判定）。 */
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
      await load();
    } catch {
      setMessage('参加申請に失敗しました（既に申請済みの可能性があります）。');
    }
  }

  const canCreate = state.status === 'authenticated' && (state.user.isAdmin || state.user.canTeach);

  return (
    <main className="page">
      <Breadcrumb items={[{ label: 'ホーム', to: '/' }, { label: '講座一覧' }]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>講座一覧</h1>
        {canCreate && <Link to="/courses/new">＋ 新しい講座を作成</Link>}
      </div>
      {message && <p className="notice">{message}</p>}
      {courses.length === 0 ? (
        <p className="empty-state">まだ講座がありません。</p>
      ) : (
        <ul className="entry-list">
          {courses.map((course) => (
            <li
              key={course.id}
              className="entry-list__item"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <h3>
                  <Link to={`/courses/${course.id}`}>{course.name}</Link>
                </h3>
                {course.description && <p className="entry-list__meta">{course.description}</p>}
              </div>
              {course.myMembership ? (
                <span className="badge">
                  {roleLabel[course.myMembership.role]} / {statusLabel[course.myMembership.status]}
                </span>
              ) : (
                <button className="btn-secondary" onClick={() => handleJoin(course.id)}>
                  参加申請
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
