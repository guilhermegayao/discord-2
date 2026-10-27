import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedRequest } from './auth.types.js';

const secret = 'segredo-de-teste-com-pelo-menos-32-caracteres';
const jwt = new JwtService({
  secret,
  signOptions: { algorithm: 'HS256' },
  verifyOptions: { algorithms: ['HS256'] },
});

function run(opts: { authorization?: string; isPublic?: boolean }) {
  const req = { headers: { authorization: opts.authorization } } as AuthenticatedRequest;
  const reflector = { getAllAndOverride: () => opts.isPublic ?? false } as unknown as Reflector;
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, result: new AuthGuard(jwt, reflector).canActivate(ctx) };
}

describe('AuthGuard', () => {
  it('libera rota pública sem token', async () => {
    await expect(run({ isPublic: true }).result).resolves.toBe(true);
  });

  it('aceita Bearer válido e coloca o usuário na requisição', async () => {
    const token = await jwt.signAsync({ sub: 'user-1' });
    const { req, result } = run({ authorization: `Bearer ${token}` });

    await expect(result).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'user-1' });
  });

  it.each([
    ['sem header', undefined],
    ['esquema errado', 'Basic abc'],
    ['Bearer vazio', 'Bearer '],
  ])('recusa %s', async (_, authorization) => {
    await expect(run({ authorization }).result).rejects.toThrow('Token de acesso ausente');
  });

  it('recusa token assinado com outro segredo', async () => {
    const forged = await new JwtService({
      secret: 'outro-segredo-com-32-caracteres-ou-mais',
    }).signAsync({ sub: 'x' });

    await expect(run({ authorization: `Bearer ${forged}` }).result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('recusa token expirado', async () => {
    const expired = await jwt.signAsync({ sub: 'x' }, { expiresIn: -10 });

    await expect(run({ authorization: `Bearer ${expired}` }).result).rejects.toThrow(
      'Token de acesso inválido ou expirado',
    );
  });

  it('recusa token com alg "none" (ataque de troca de algoritmo)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url');

    await expect(
      run({ authorization: `Bearer ${header}.${payload}.` }).result,
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
