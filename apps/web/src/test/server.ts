import type { AuthResponse, UserDto } from '@discord-2/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const testUser: UserDto = {
  id: '0190f0b2-0000-7000-8000-000000000001',
  email: 'gui@example.com',
  username: 'gui',
  displayName: 'Guilherme',
  createdAt: '2026-10-27T12:00:00.000Z',
};

export function authResponse(accessToken = 'access-1'): AuthResponse {
  return { accessToken, user: testUser };
}

export const unauthorized = (message = 'Sessão ausente') =>
  HttpResponse.json({ statusCode: 401, message }, { status: 401 });

/** API falsa no nível da rede. Por padrão, ninguém está logado. */
export const server = setupServer(
  http.post('/api/auth/refresh', () => unauthorized()),
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/health', () =>
    HttpResponse.json({ status: 'ok', uptime: 42, timestamp: new Date().toISOString(), db: 'up' }),
  ),
);
