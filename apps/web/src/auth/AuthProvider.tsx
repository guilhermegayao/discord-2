import type { LoginData, RegisterData } from '@discord-2/shared';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { onSessionExpired, refreshSession } from '../api/client';
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  // Ao abrir o app: o cookie httpOnly (se existir) vira um access token novo.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (!active) return;
        setState(
          session
            ? { status: 'authenticated', user: session.user }
            : { status: 'anonymous', user: null },
        );
      })
      .catch(() => {
        if (active) setState({ status: 'anonymous', user: null });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => onSessionExpired(() => setState({ status: 'anonymous', user: null })), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      async login(data: LoginData) {
        const { user } = await authApi.login(data);
        setState({ status: 'authenticated', user });
      },
      async register(data: RegisterData) {
        const { user } = await authApi.register(data);
        setState({ status: 'authenticated', user });
      },
      async logout() {
        try {
          await authApi.logout();
        } finally {
          setState({ status: 'anonymous', user: null });
        }
      },
    }),
    [state],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
