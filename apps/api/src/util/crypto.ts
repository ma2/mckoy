// Workers標準のWebCrypto APIのみを使う小さなユーティリティ（node:cryptoは使わない）。

/** 招待トークン・セッショントークンをDBに保存する前にハッシュ化するために使う。 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 招待・セッションのトークンとして使う、推測困難なランダム文字列（base64url）を生成する。 */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
