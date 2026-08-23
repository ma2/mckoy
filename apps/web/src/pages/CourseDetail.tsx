import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import {
  approveMember,
  createCourseInvitation,
  getCourse,
  getMyMembership,
  joinCourse,
  listMembers,
  rejectMember,
  roleLabel,
  statusLabel,
  updateCourse,
  type Course,
  type Member,
  type MembershipRole,
  type MembershipStatus,
} from '../lib/courses';

/**
 * 講座詳細画面。誰が見ても名称・説明・小説一覧等へのリンクは出るが、
 * 編集フォーム・メンバー管理・生徒招待は講師/管理者のみ。canManageの判定は
 * 「メンバー一覧取得を試み、403なら講師/管理者ではない」という方法で行っている
 * （専用の権限判定APIを持たないため、既存の講師限定エンドポイントを流用している）。
 */
export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [myMembership, setMyMembership] = useState<{ role: MembershipRole; status: MembershipStatus } | null>(null);
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

    const { membership } = await getMyMembership(id);
    setMyMembership(membership);

    // メンバー一覧APIは講師/管理者専用なので、これが通るかどうかで
    // 「自分がこの講座を管理できるか」を判定する。
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
      await load();
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
      <main className="page">
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>{course.name}</h1>
      <p>
        <Link to={`/courses/${id}/novels`}>小説一覧</Link>
        {' ・ '}
        <Link to={`/courses/${id}/assignments`}>課題</Link>
        {' ・ '}
        <Link to={`/courses/${id}/announcements`}>お知らせ</Link>
      </p>
      {message && <p className="notice">{message}</p>}

      {!canManage && (
        <div className="card">
          <p>{course.description || '説明はまだ登録されていません。'}</p>
          {myMembership ? (
            <span className="badge">
              {roleLabel[myMembership.role]} / {statusLabel[myMembership.status]}
            </span>
          ) : (
            <button onClick={handleJoin}>参加申請</button>
          )}
        </div>
      )}

      {canManage && (
        <>
          <div className="card">
            <form onSubmit={handleUpdate}>
              <label className="field">
                講座名
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                説明
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <button type="submit">更新</button>
            </form>
          </div>

          <h2>メンバー</h2>
          {!members || members.length === 0 ? (
            <p className="empty-state">まだメンバーがいません。</p>
          ) : (
            <ul className="entry-list">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="entry-list__item"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <h3>{m.userName}</h3>
                    <p className="entry-list__meta">{m.userEmail}</p>
                    <span className="badge" style={{ marginRight: 'var(--space-2)' }}>
                      {roleLabel[m.role] ?? m.role}
                    </span>
                    <span className={m.status === 'active' ? 'badge badge-accent' : 'badge'}>
                      {statusLabel[m.status] ?? m.status}
                    </span>
                  </div>
                  {m.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button onClick={() => handleApprove(m.id)}>承認</button>
                      <button className="btn-danger" onClick={() => handleReject(m.id)}>
                        拒否
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h2>生徒を招待</h2>
          <div className="card">
            <form onSubmit={handleInvite}>
              <label className="field">
                氏名
                <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} required />
              </label>
              <label className="field">
                メールアドレス
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              </label>
              <button type="submit">招待URLを発行</button>
            </form>
            {invitationUrl && (
              <p className="notice" style={{ marginTop: 'var(--space-4)' }}>
                招待URL: <code>{invitationUrl}</code>
              </p>
            )}
          </div>
        </>
      )}

      <Link className="back-link" to="/courses">
        講座一覧へ戻る
      </Link>
    </main>
  );
}
