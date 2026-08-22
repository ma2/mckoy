import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { Bindings } from '../env';
import { storeChallenge, consumeChallenge } from './challenge';
import { getPasskeyByCredentialId, listPasskeysByUserId, touchPasskeyUsage } from '../db/passkeys';

type RpConfig = Pick<Bindings, 'RP_ID' | 'RP_NAME' | 'RP_ORIGIN'>;

/** Our internal user.id (a UUID string) doubles as the WebAuthn user handle. */
function userHandle(userId: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(userId);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return new Uint8Array(buffer);
}

export async function createRegistrationOptions(
  db: D1Database,
  env: RpConfig,
  user: { id: string; name: string; email: string },
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await listPasskeysByUserId(db, user.id);
  const options = await generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: env.RP_ID,
    userID: userHandle(user.id),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: existing.map((passkey) => ({
      id: passkey.credential_id,
      transports: (passkey.transports?.split(',') ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });
  await storeChallenge(db, { challenge: options.challenge, userId: user.id, purpose: 'registration' });
  return options;
}

export async function verifyRegistration(
  db: D1Database,
  env: RpConfig,
  response: RegistrationResponseJSON,
): Promise<{ credentialId: string; publicKey: string; counter: number; transports: string | null } | null> {
  const clientData = JSON.parse(isoBase64URL.toUTF8String(response.response.clientDataJSON)) as {
    challenge: string;
  };
  const consumed = await consumeChallenge(db, { challenge: clientData.challenge, purpose: 'registration' });
  if (!consumed) return null;

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: clientData.challenge,
    expectedOrigin: env.RP_ORIGIN,
    expectedRPID: env.RP_ID,
  });
  if (!verification.verified || !verification.registrationInfo) return null;

  const { credential } = verification.registrationInfo;
  return {
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: response.response.transports?.join(',') ?? null,
  };
}

export async function createAuthenticationOptions(
  db: D1Database,
  env: RpConfig,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: 'preferred',
  });
  await storeChallenge(db, { challenge: options.challenge, userId: null, purpose: 'authentication' });
  return options;
}

export async function verifyAuthentication(
  db: D1Database,
  env: RpConfig,
  response: AuthenticationResponseJSON,
): Promise<{ userId: string; passkeyId: string; newCounter: number } | null> {
  const clientData = JSON.parse(isoBase64URL.toUTF8String(response.response.clientDataJSON)) as {
    challenge: string;
  };
  const consumed = await consumeChallenge(db, { challenge: clientData.challenge, purpose: 'authentication' });
  if (!consumed) return null;

  const passkey = await getPasskeyByCredentialId(db, response.id);
  if (!passkey) return null;

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: clientData.challenge,
    expectedOrigin: env.RP_ORIGIN,
    expectedRPID: env.RP_ID,
    credential: {
      id: passkey.credential_id,
      publicKey: isoBase64URL.toBuffer(passkey.public_key),
      counter: passkey.counter,
      transports: (passkey.transports?.split(',') ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    },
  });
  if (!verification.verified) return null;

  await touchPasskeyUsage(db, passkey.id, verification.authenticationInfo.newCounter);
  return {
    userId: passkey.user_id,
    passkeyId: passkey.id,
    newCounter: verification.authenticationInfo.newCounter,
  };
}
