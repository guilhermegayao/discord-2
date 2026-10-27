import type { LoginData, RegisterData, UserDto } from '@discord-2/shared';
import { createContext, useContext } from 'react';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: UserDto }
  | { status: 'anonymous'; user: null };

export type AuthContextValue = AuthState & {
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
