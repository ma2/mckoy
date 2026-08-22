import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Me } from './webauthn';

type AuthState = { status: 'loading' } | { status: 'authenticated'; user: Me } | { status: 'unauthenticated' };

const AuthContext = createContext<{ state: AuthState; refresh: () => Promise<void> } | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

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
