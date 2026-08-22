import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourse, getMyMembership, type Course } from '../lib/courses';
import { listNovels, type NovelSummary } from '../lib/novels';

const visibilityLabel: Record<string, string> = {
  instructors: '講師のみ',
  course_students: '講座メンバー',
  all_users: '全員',
};

/** 講座内の小説一覧（サーバー側でvisibilityによる絞り込み済み）。「小説を投稿」はその講座のactiveな生徒にのみ表示する。 */
export default function NovelList() {
  const { id: courseId } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [novels, setNovels] = useState<NovelSummary[]>([]);
  const [canPost, setCanPost] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    getCourse(courseId).then((result) => setCourse(result.course));
    listNovels(courseId).then((result) => setNovels(result.novels));
    getMyMembership(courseId).then((result) => {
      setCanPost(result.membership?.role === 'student' && result.membership.status === 'active');
    });
  }, [courseId]);

  return (
    <main className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>{course ? `${course.name} の小説一覧` : '小説一覧'}</h1>
        {canPost && <Link to={`/courses/${courseId}/novels/new`}>＋ 小説を投稿</Link>}
      </div>
      {novels.length === 0 ? (
        <p className="empty-state">まだ小説が投稿されていません。</p>
      ) : (
        <ul className="entry-list">
          {novels.map((novel) => (
            <li key={novel.id} className="entry-list__item">
              <h3>
                <Link to={`/novels/${novel.id}`}>{novel.title}</Link>
                <span className="entry-list__meta" style={{ fontWeight: 'normal', marginLeft: 'var(--space-2)' }}>
                  {novel.authorName}
                </span>
              </h3>
              <span className="badge">{visibilityLabel[novel.visibility]}</span>
              {novel.tags.map((tag) => (
                <span className="badge badge-accent" key={tag} style={{ marginLeft: 'var(--space-2)' }}>
                  {tag}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
      <Link className="back-link" to={`/courses/${courseId}`}>
        {course ? `${course.name} トップへ` : '講座トップへ'}
      </Link>
    </main>
  );
}
