// User-Agent文字列から「iPhone Safari」のような分かりやすいデフォルト名を推測する。
// パスキー登録時に名前が空のままだと、一覧でどれを削除すべきか判別できない
// （issue #35）ため、登録リクエストのUser-AgentヘッダーからOS・ブラウザを
// おおまかに判別してデフォルト名として保存する。完全な検出は目指さない。

function guessOs(userAgent: string): string | null {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Linux/.test(userAgent)) return 'Linux';
  return null;
}

function guessBrowser(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/CriOS\//.test(userAgent)) return 'Chrome';
  if (/FxiOS\//.test(userAgent)) return 'Firefox';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return null;
}

export function guessPasskeyName(userAgent: string | null | undefined): string {
  if (!userAgent) return '不明なデバイス';
  const parts = [guessOs(userAgent), guessBrowser(userAgent)].filter((v): v is string => v !== null);
  return parts.length > 0 ? parts.join(' ') : '不明なデバイス';
}
