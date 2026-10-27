import {
  type AuthResponse,
  authResponseSchema,
  type LoginData,
  type RegisterData,
  type UserDto,
  userSchema,
} from '@discord-2/shared';
import { api, setAccessToken } from './client';

export async function register(data: RegisterData): Promise<AuthResponse> {
  const res = await api('/auth/register', {
    method: 'POST',
    body: data,
    schema: authResponseSchema,
  });
  setAccessToken(res.accessToken);
  return res;
}

export async function login(data: LoginData): Promise<AuthResponse> {
  const res = await api('/auth/login', { method: 'POST', body: data, schema: authResponseSchema });
  setAccessToken(res.accessToken);
  return res;
}

export async function logout(): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

export function getMe(): Promise<UserDto> {
  return api('/users/me', { schema: userSchema });
}
