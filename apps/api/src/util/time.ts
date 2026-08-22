/**
 * D1's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" (UTC, no offset/millis).
 * Any timestamp we generate in JS for storage or comparison must match this
 * exact format, since timestamps are compared lexicographically as TEXT.
 */
export function sqliteTimestamp(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ');
}
