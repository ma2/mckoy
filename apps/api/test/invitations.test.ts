import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  createInvitation,
  getInvitationByTokenHash,
  isInvitationUsable,
  markInvitationUsed,
} from '../src/db/invitations';
import { createCourse } from '../src/db/courses';
import { createUser } from '../src/db/users';
import { getMembershipByCourseAndUser } from '../src/db/course_memberships';
import { grantCourseMembershipIfInvited } from '../src/routes/invitations';
import { sha256Hex } from '../src/util/crypto';
import { sqliteTimestamp } from '../src/util/time';

async function seedInvitation(
  overrides: {
    expiresAt?: string;
    used?: boolean;
    revoked?: boolean;
    courseId?: string | null;
    membershipRole?: 'instructor' | 'student' | null;
  } = {},
) {
  const token = `test-token-${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);
  await createInvitation(env.DB, {
    id: crypto.randomUUID(),
    email: `student-${crypto.randomUUID()}@example.com`,
    name: 'Student',
    isAdmin: false,
    canTeach: false,
    courseId: overrides.courseId ?? null,
    membershipRole: overrides.membershipRole ?? null,
    tokenHash,
    expiresAt: overrides.expiresAt ?? sqliteTimestamp(60_000),
    invitedBy: null,
  });
  const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
  if (overrides.used) {
    await markInvitationUsed(env.DB, invitation!.id);
  }
  if (overrides.revoked) {
    await env.DB.prepare('UPDATE invitations SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(invitation!.id)
      .run();
  }
  return tokenHash;
}

describe('invitation usability', () => {
  it('is usable when unexpired, unused, and unrevoked', async () => {
    const tokenHash = await seedInvitation();
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    expect(isInvitationUsable(invitation!, sqliteTimestamp())).toBe(true);
  });

  it('rejects an expired invitation', async () => {
    const tokenHash = await seedInvitation({ expiresAt: sqliteTimestamp(-60_000) });
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    expect(isInvitationUsable(invitation!, sqliteTimestamp())).toBe(false);
  });

  it('rejects an already-used invitation', async () => {
    const tokenHash = await seedInvitation({ used: true });
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    expect(isInvitationUsable(invitation!, sqliteTimestamp())).toBe(false);
  });

  it('rejects a revoked invitation', async () => {
    const tokenHash = await seedInvitation({ revoked: true });
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    expect(isInvitationUsable(invitation!, sqliteTimestamp())).toBe(false);
  });
});

describe('grantCourseMembershipIfInvited', () => {
  it('creates an active membership immediately when the invitation names a course', async () => {
    const owner = await createUser(env.DB, {
      id: crypto.randomUUID(),
      name: 'Owner',
      email: `owner-${crypto.randomUUID()}@example.com`,
      isAdmin: false,
      canTeach: true,
    });
    const courseId = crypto.randomUUID();
    await createCourse(env.DB, { id: courseId, name: `Course ${crypto.randomUUID()}`, description: null, createdBy: owner.id });

    const tokenHash = await seedInvitation({ courseId, membershipRole: 'student' });
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    const newUser = await createUser(env.DB, {
      id: crypto.randomUUID(),
      name: 'New Student',
      email: `newstudent-${crypto.randomUUID()}@example.com`,
      isAdmin: false,
      canTeach: false,
    });

    await grantCourseMembershipIfInvited(env.DB, invitation!, newUser.id);

    const membership = await getMembershipByCourseAndUser(env.DB, courseId, newUser.id);
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe('student');
    expect(membership!.status).toBe('active');
  });

  it('does nothing when the invitation has no course', async () => {
    const tokenHash = await seedInvitation();
    const invitation = await getInvitationByTokenHash(env.DB, tokenHash);
    // Should not throw even though there is no course to join.
    await expect(grantCourseMembershipIfInvited(env.DB, invitation!, crypto.randomUUID())).resolves.toBeUndefined();
  });
});
