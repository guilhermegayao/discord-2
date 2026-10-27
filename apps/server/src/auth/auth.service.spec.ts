import type { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { SessionsService } from './sessions.service.js';

function setup(user: unknown) {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
  const jwt = { signAsync: vi.fn().mockResolvedValue('access-token') };
  const sessions = { issue: vi.fn().mockResolvedValue('refresh-token') };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    sessions as unknown as SessionsService,
  );
  return { service, sessions };
}

describe('AuthService.login', () => {
  it('com e-mail inexistente, ainda roda o argon2 (tempo de resposta parecido)', async () => {
    const verify = vi.spyOn(argon2, 'verify');
    const { service, sessions } = setup(null);

    await expect(service.login({ email: 'x@y.com', password: 'qualquer' })).rejects.toThrow(
      'E-mail ou senha incorretos',
    );
    expect(verify).toHaveBeenCalledTimes(1);
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('com senha correta, emite access e refresh token', async () => {
    const user = {
      id: 'u1',
      email: 'x@y.com',
      username: 'x',
      displayName: 'X',
      passwordHash: await argon2.hash('certa-123'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const { service } = setup(user);

    const result = await service.login({ email: 'x@y.com', password: 'certa-123' });

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'u1',
        email: 'x@y.com',
        username: 'x',
        displayName: 'X',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });
});
