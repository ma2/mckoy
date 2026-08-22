import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Me } from './webauthn';

// 現在ログイン中のユーザー情報をアプリ全体で共有するContext。マウント時に
// GET /api/me を叩いて認証状態を確定させる（App.tsxのRequireAuthが参照する）。

type AuthState = { status: 'loading' } | { status: 'authenticated'; user: Me } | { status: 'unauthenticated' };

const AuthContext = createContext<{ state: AuthState; refresh: () => Promise<void> } | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  /** サーバーに問い合わせて認証状態を更新する。ログイン/ログアウト/パスキー登録の直後に呼ぶ。 */
  async function refresh() {
    try {
      const { user } = await api.get<{ user: Me }>('/me');
      setState({ status: 'authenticated', user });
    } catch {
      setState({ status: 'unauthenticated' });
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return <AuthContext.Provider value={{ state, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
