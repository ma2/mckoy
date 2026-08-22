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

// @simplewebauthn/server をラップし、登録・認証それぞれのoptions生成とレスポンス
//検証をまとめる。独自暗号実装を避け実績あるライブラリを使う方針（仕様書 §24.13）。

type RpConfig = Pick<Bindings, 'RP_ID' | 'RP_NAME' | 'RP_ORIGIN'>;

/** 内部の user.id（UUID文字列）を、そのままWebAuthnのuser handleとして流用する。 */
function userHandle(userId: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(userId);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return new Uint8Array(buffer);
}

/** パスキー登録用のオプションを生成し、challengeをDBに保存する。既存パスキーは excludeCredentials で除外する。 */
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

/** 登録レスポンスを検証する。challengeの消費・署名検証に失敗すればnullを返す（呼び出し側で400扱い）。 */
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

/** ログイン用のオプションを生成する。allowCredentialsを指定しないことで discoverable credential（メール入力なしログイン）にする。 */
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

/** ログインレスポンスを検証する。credential idからパスキー（＝ユーザー）を特定し、成功したらカウンタを更新する。 */
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
