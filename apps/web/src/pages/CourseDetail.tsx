import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import {
  approveMember,
  createCourseInvitation,
  getCourse,
  joinCourse,
  listMembers,
  rejectMember,
  updateCourse,
  type Course,
  type Member,
} from '../lib/courses';

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const { course } = await getCourse(id);
    setCourse(course);
    setName(course.name);
    setDescription(course.description ?? '');

    try {
      const result = await listMembers(id);
      setMembers(result.members);
      setCanManage(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setCanManage(false);
      } else {
        throw err;
      }
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setMessage(null);
    try {
      const { course } = await updateCourse(id, { name, description: description || null });
      setCourse(course);
      setMessage('更新しました。');
    } catch {
      setMessage('更新に失敗しました（講座名が重複している可能性があります）。');
    }
  }

  async function handleJoin() {
    if (!id) return;
    setMessage(null);
    try {
      await joinCourse(id);
      setMessage('参加申請を送信しました。');
    } catch {
      setMessage('参加申請に失敗しました（既に申請済みの可能性があります）。');
    }
  }

  async function handleApprove(membershipId: string) {
    if (!id) return;
    await approveMember(id, membershipId);
    await load();
  }

  async function handleReject(membershipId: string) {
    if (!id) return;
    await rejectMember(id, membershipId);
    await load();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setInvitationUrl(null);
    const { invitationUrl } = await createCourseInvitation(id, { name: inviteName, email: inviteEmail });
    setInvitationUrl(invitationUrl);
    setInviteName('');
    setInviteEmail('');
  }

  if (!course) {
    return (
      <main className="centered">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="centered">
      <h1>{course.name}</h1>
      <p>
        <Link to={`/courses/${id}/novels`}>小説一覧</Link>
      </p>
      {message && <p>{message}</p>}

      {!canManage && (
        <>
          <p>{course.description}</p>
          <button onClick={handleJoin}>参加申請</button>
        </>
      )}

      {canManage && (
        <>
          <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
            <button type="submit">更新</button>
          </form>

          <h2>メンバー</h2>
          <ul>
            {members?.map((m) => (
              <li key={m.id}>
                {m.userName} ({m.userEmail}) — {m.role} / {m.status}
                {m.status === 'pending' && (
                  <>
                    {' '}
                    <button onClick={() => handleApprove(m.id)}>承認</button>
                    <button onClick={() => handleReject(m.id)}>拒否</button>
                  </>
                )}
              </li>
            ))}
          </ul>

          <h2>生徒を招待</h2>
          <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label>
              氏名
              <br />
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} required />
            </label>
            <label>
              メールアドレス
              <br />
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            </label>
            <button type="submit">招待URLを発行</button>
          </form>
          {invitationUrl && (
            <p>
              招待URL: <code>{invitationUrl}</code>
            </p>
          )}
        </>
      )}

      <p>
        <Link to="/courses">講座一覧へ戻る</Link>
      </p>
    </main>
  );
}
