import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMyMembership } from '../lib/courses';
import { listNovels, type NovelSummary } from '../lib/novels';

const visibilityLabel: Record<string, string> = {
  instructors: '講師のみ',
  course_students: '講座メンバー',
  all_users: '全員',
};

/** 講座内の小説一覧（サーバー側でvisibilityによる絞り込み済み）。「小説を投稿」はその講座のactiveな生徒にのみ表示する。 */
export default function NovelList() {
  const { id: courseId } = useParams<{ id: string }>();
  const [novels, setNovels] = useState<NovelSummary[]>([]);
  const [canPost, setCanPost] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    listNovels(courseId).then((result) => setNovels(result.novels));
    getMyMembership(courseId).then((result) => {
      setCanPost(result.membership?.role === 'student' && result.membership.status === 'active');
    });
  }, [courseId]);

  return (
    <main className="centered">
      <h1>小説一覧</h1>
      {canPost && (
        <p>
          <Link to={`/courses/${courseId}/novels/new`}>小説を投稿</Link>
        </p>
      )}
      <ul>
        {novels.map((novel) => (
          <li key={novel.id}>
            <Link to={`/novels/${novel.id}`}>{novel.title}</Link> ({visibilityLabel[novel.visibility]})
            {novel.tags.length > 0 && <> — タグ: {novel.tags.join(', ')}</>}
          </li>
        ))}
      </ul>
      <p>
        <Link to={`/courses/${courseId}`}>講座詳細へ戻る</Link>
      </p>
    </main>
  );
}
