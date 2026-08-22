import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api } from './api';

// @simplewebauthn/browser をラップし、「APIからoptionsを取得→ブラウザにパスキー
// 操作をさせる→結果をAPIに送って検証」という3ステップを1関数にまとめる。

export type Me = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  canTeach: boolean;
};

/** 招待受諾画面から呼ぶ。成功するとアカウントが作成され、セッションCookieが発行される。 */
export async function registerPasskeyForInvitation(token: string): Promise<{ user: Me }> {
  const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>(
    `/invitations/${token}/register/options`,
  );
  const attestation = await startRegistration({ optionsJSON });
  return api.post(`/invitations/${token}/register/verify`, attestation);
}

/** discoverable credentialによるログイン。メールアドレス等の事前入力は不要。 */
export async function loginWithPasskey(): Promise<{ user: Me }> {
  const optionsJSON = await api.post<PublicKeyCredentialRequestOptionsJSON>('/auth/login/options');
  const assertion = await startAuthentication({ optionsJSON });
  return api.post('/auth/login/verify', assertion);
}

/** ログイン済みユーザーが、パスキー管理画面から追加のパスキーを登録する。 */
export async function addPasskey(): Promise<void> {
  const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>('/me/passkeys/options');
  const attestation = await startRegistration({ optionsJSON });
  await api.post('/me/passkeys/verify', attestation);
}
