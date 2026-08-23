import { Hono, type Context } from 'hono';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { AppEnv } from '../types';
import { sha256Hex } from '../util/crypto';
import { sqliteTimestamp } from '../util/time';
import { getInvitationByTokenHash, isInvitationUsable, markInvitationUsed, type InvitationRow } from '../db/invitations';
import { createUser, getUserByEmail } from '../db/users';
import { createPasskey } from '../db/passkeys';
import { getCourseById } from '../db/courses';
import { createMembership, type MembershipRole } from '../db/course_memberships';
import { createRegistrationOptions, verifyRegistration } from '../auth/webauthn';
import { issueSession } from '../auth/session';
import { guessPasskeyName } from '../auth/device-name';

// 招待の確認・受諾（パスキー登録による新規アカウント作成）を扱う。
// 招待の「作成」は routes/admin-invitations.ts / routes/courses.ts の役割。

export const invitationsRoute = new Hono<AppEnv>();

/** URLパラメータのトークンから、使用可能な招待を探す（見つからない/使用不可ならnull）。 */
async function loadUsableInvitation(c: Context<AppEnv>, db: D1Database) {
  const token = c.req.param('token');
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const invitation = await getInvitationByTokenHash(db, tokenHash);
  if (!invitation || !isInvitationUsable(invitation, sqliteTimestamp())) return null;
  return invitation;
}

/**
 * 講師発の講座招待は、登録と同時にactive membershipを付与する（仕様書 §9.2）。
 * 生徒からの参加申請と違い、講師の承認ステップは無い。
 */
export async function grantCourseMembershipIfInvited(
  db: D1Database,
  invitation: InvitationRow,
  userId: string,
): Promise<void> {
  if (!invitation.course_id) return;
  await createMembership(db, {
    id: crypto.randomUUID(),
    courseId: invitation.course_id,
    userId,
    role: (invitation.membership_role as MembershipRole | null) ?? 'student',
    status: 'active',
  });
}

/** 招待受諾画面に表示する氏名・メール・（あれば）対象講座名を返す。認証不要。 */
invitationsRoute.get('/:token', async (c) => {
  const invitation = await loadUsableInvitation(c, c.env.DB);
  if (!invitation) return c.json({ error: 'invitation_not_found' }, 404);

  const course = invitation.course_id ? await getCourseById(c.env.DB, invitation.course_id) : null;
  return c.json({
    name: invitation.name,
    email: invitation.email,
    course: course ? { id: course.id, name: course.name } : null,
  });
});

/** パスキー登録用のoptionsを発行する。ユーザー行はまだ存在しないので、招待idを仮のuser idとして使う。 */
invitationsRoute.post('/:token/register/options', async (c) => {
  const invitation = await loadUsableInvitation(c, c.env.DB);
  if (!invitation) return c.json({ error: 'invitation_not_found' }, 404);

  const existingUser = await getUserByEmail(c.env.DB, invitation.email);
  if (existingUser) return c.json({ error: 'already_registered' }, 409);

  // 招待idを仮のuser idとして使うことで、実際のユーザー行がまだ無い時点でも
  // WebAuthnのexcludeCredentials/userHandleのロジックが成立する。
  // 実ユーザーの作成はverify時（下のハンドラ）に行う。
  const options = await createRegistrationOptions(c.env.DB, c.env, {
    id: invitation.id,
    name: invitation.name,
    email: invitation.email,
  });
  return c.json(options);
});

/** 登録を確定する: パスキー検証 → ユーザー/パスキー作成 → （講座招待なら）membership付与 → セッション発行。 */
invitationsRoute.post('/:token/register/verify', async (c) => {
  const invitation = await loadUsableInvitation(c, c.env.DB);
  if (!invitation) return c.json({ error: 'invitation_not_found' }, 404);

  const existingUser = await getUserByEmail(c.env.DB, invitation.email);
  if (existingUser) return c.json({ error: 'already_registered' }, 409);

  const body = await c.req.json<RegistrationResponseJSON>();
  const verified = await verifyRegistration(c.env.DB, c.env, body);
  if (!verified) return c.json({ error: 'verification_failed' }, 400);

  const user = await createUser(c.env.DB, {
    id: invitation.id,
    name: invitation.name,
    email: invitation.email,
    isAdmin: invitation.is_admin === 1,
    canTeach: invitation.can_teach === 1,
  });
  await createPasskey(c.env.DB, {
    id: crypto.randomUUID(),
    userId: user.id,
    credentialId: verified.credentialId,
    publicKey: verified.publicKey,
    counter: verified.counter,
    transports: verified.transports,
    name: guessPasskeyName(c.req.header('user-agent')),
  });
  await grantCourseMembershipIfInvited(c.env.DB, invitation, user.id);
  await markInvitationUsed(c.env.DB, invitation.id);
  await issueSession(c, user.id);

  return c.json({ user });
});
