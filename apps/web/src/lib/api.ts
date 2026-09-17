// APIサーバーとの通信をまとめるfetchラッパー。credentials: 'include' で
// セッションCookieを常に送る。開発時はVite proxyにより /api が同一オリジンに見える
// ので、CORSやcrossサイトCookieの考慮は不要（wrangler.tomlのデプロイ設定も同様）。

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * 招待の作成（新規アカウント作成扱い）・受諾のどちらでも、既に users 行があるメール
 * アドレスに対しては 409 'already_registered' が返る（routes/invitations.ts,
 * admin-invitations.ts, courses.ts）。パスキーを失ったユーザーの復旧には別の招待
 * （パスキー再登録招待、仕様書 §7.1）を使うべきなので、画面側で区別してその旨を案内する。
 */
export function isAlreadyRegisteredError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.message === 'already_registered';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body !== undefined ? JSON.stringify(body) : undefined }),
};
