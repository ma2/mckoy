import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { storeChallenge, consumeChallenge } from '../src/auth/challenge';

describe('webauthn challenge single-use', () => {
  it('consumes a stored challenge exactly once', async () => {
    const challenge = `challenge-${crypto.randomUUID()}`;
    await storeChallenge(env.DB, { challenge, userId: null, purpose: 'authentication' });

    expect(await consumeChallenge(env.DB, { challenge, purpose: 'authentication' })).toBe(true);
    expect(await consumeChallenge(env.DB, { challenge, purpose: 'authentication' })).toBe(false);
  });

  it('rejects a challenge consumed for the wrong purpose', async () => {
    const challenge = `challenge-${crypto.randomUUID()}`;
    await storeChallenge(env.DB, { challenge, userId: null, purpose: 'registration' });

    expect(await consumeChallenge(env.DB, { challenge, purpose: 'authentication' })).toBe(false);
  });

  it('rejects a challenge that was never stored', async () => {
    expect(await consumeChallenge(env.DB, { challenge: 'never-stored', purpose: 'authentication' })).toBe(false);
  });
});
