import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { hashToken, SessionsService } from './sessions.service.js';

const future = new Date(Date.now() + 60_000);
const past = new Date(Date.now() - 60_000);
const anyDate = expect.any(Date) as Date;

function setup() {
  const prisma = {
    session: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = { get: vi.fn().mockReturnValue(30) };
  const service = new SessionsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService<Env, true>,
  );
  return { prisma, service };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    userId: 'u1',
    familyId: 'f1',
    revokedAt: null,
    expiresAt: future,
    ...overrides,
  };
}

describe('SessionsService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('issue: salva só o hash do token, nunca o token', async () => {
    const token = await ctx.service.issue('u1');

    const { data } = ctx.prisma.session.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(token).toMatch(/^[\w-]{43}$/); // 32 bytes em base64url
    expect(data.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it('issue: cada login começa uma família nova', async () => {
    await ctx.service.issue('u1');
    await ctx.service.issue('u1');

    const [a, b] = ctx.prisma.session.create.mock.calls.map(
      (c) => (c[0] as { data: { familyId: string } }).data.familyId,
    );
    expect(a).not.toBe(b);
  });

  it('rotate: revoga o token usado e emite outro na mesma família', async () => {
    ctx.prisma.session.findUnique.mockResolvedValue(session());

    const result = await ctx.service.rotate('token-antigo');

    expect(result.userId).toBe('u1');
    expect(ctx.prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', revokedAt: null },
      data: { revokedAt: anyDate },
    });
    const { data } = ctx.prisma.session.create.mock.calls[0]![0] as { data: { familyId: string } };
    expect(data.familyId).toBe('f1');
  });

  it('rotate: token desconhecido dá 401', async () => {
    ctx.prisma.session.findUnique.mockResolvedValue(null);

    await expect(ctx.service.rotate('x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotate: token expirado dá 401 sem revogar a família', async () => {
    ctx.prisma.session.findUnique.mockResolvedValue(session({ expiresAt: past }));

    await expect(ctx.service.rotate('x')).rejects.toThrow('Sessão expirada');
    expect(ctx.prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('rotate: token já revogado (reuso) revoga a família inteira', async () => {
    ctx.prisma.session.findUnique.mockResolvedValue(session({ revokedAt: past }));

    await expect(ctx.service.rotate('x')).rejects.toThrow('Sessão revogada');
    expect(ctx.prisma.session.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'f1', revokedAt: null },
      data: { revokedAt: anyDate },
    });
    expect(ctx.prisma.session.create).not.toHaveBeenCalled();
  });

  it('rotate: se outra requisição rotacionou antes (corrida), trata como reuso', async () => {
    ctx.prisma.session.findUnique.mockResolvedValue(session());
    ctx.prisma.session.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(ctx.service.rotate('x')).rejects.toThrow('Sessão revogada');
    expect(ctx.prisma.session.updateMany).toHaveBeenLastCalledWith({
      where: { familyId: 'f1', revokedAt: null },
      data: { revokedAt: anyDate },
    });
  });
});
