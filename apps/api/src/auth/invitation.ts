import { createInvitation } from '../db/invitations';
import { sha256Hex, randomToken } from '../util/crypto';
import { sqliteTimestamp } from '../util/time';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, per MCKOY_SPEC.md §5.4

/** Creates an invitation row and returns the raw (unhashed) token for the invite URL. */
export async function issueInvitation(
  db: D1Database,
  params: {
    name: string;
    email: string;
    isAdmin: boolean;
    canTeach: boolean;
    courseId: string | null;
    membershipRole: 'instructor' | 'student' | null;
    invitedBy: string;
  },
): Promise<string> {
  const token = randomToken();
  await createInvitation(db, {
    id: crypto.randomUUID(),
    email: params.email,
    name: params.name,
    isAdmin: params.isAdmin,
    canTeach: params.canTeach,
    courseId: params.courseId,
    membershipRole: params.membershipRole,
    tokenHash: await sha256Hex(token),
    expiresAt: sqliteTimestamp(INVITATION_TTL_MS),
    invitedBy: params.invitedBy,
  });
  return token;
}
