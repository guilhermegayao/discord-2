import type {
  AuthResponse,
  ChannelDto,
  GuildWithChannelsDto,
  MessageDto,
  UserDto,
} from '@discord-2/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const testUser: UserDto = {
  id: '0190f0b2-0000-7000-8000-000000000001',
  email: 'gui@example.com',
  username: 'gui',
  displayName: 'Guilherme',
  createdAt: '2026-10-27T12:00:00.000Z',
};

export const otherUser = { id: 'u-2', username: 'ana', displayName: 'Ana' };

export function authResponse(accessToken = 'access-1'): AuthResponse {
  return { accessToken, user: testUser };
}

export const unauthorized = (message = 'Sessão ausente') =>
  HttpResponse.json({ statusCode: 401, message }, { status: 401 });

export const notFound = (message = 'Não encontrado') =>
  HttpResponse.json({ statusCode: 404, message }, { status: 404 });

export function channel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'c-geral',
    guildId: 'g-1',
    name: 'geral',
    type: 'TEXT',
    position: 0,
    createdAt: '2026-10-27T12:00:00.000Z',
    ...overrides,
  };
}

export function guild(overrides: Partial<GuildWithChannelsDto> = {}): GuildWithChannelsDto {
  return {
    id: 'g-1',
    name: 'Os Amigos',
    ownerId: testUser.id,
    createdAt: '2026-10-27T12:00:00.000Z',
    channels: [channel()],
    ...overrides,
  };
}

let seq = 0;
/** Mensagem de exemplo; `minutesAgo` controla a ordem no tempo. */
export function message(overrides: Partial<MessageDto> & { minutesAgo?: number } = {}): MessageDto {
  const { minutesAgo = 0, ...rest } = overrides;
  seq++;
  return {
    id: `m-${seq}`,
    channelId: 'c-geral',
    author: { id: testUser.id, username: testUser.username, displayName: testUser.displayName },
    content: `mensagem ${seq}`,
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    editedAt: null,
    ...rest,
  };
}

/** API falsa no nível da rede. Por padrão, ninguém está logado e não há servidores. */
export const server = setupServer(
  http.post('/api/auth/refresh', () => unauthorized()),
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/guilds', () => HttpResponse.json([])),
  http.get('/api/guilds/:guildId/members', () => HttpResponse.json([])),
  http.get('/api/dms', () => HttpResponse.json([])),
  http.get('/api/health', () =>
    HttpResponse.json({ status: 'ok', uptime: 42, timestamp: new Date().toISOString(), db: 'up' }),
  ),
);
