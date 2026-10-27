import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Refresh tokens com rotação e detecção de reuso.
 *
 * - Cada login cria uma "família". Cada refresh revoga o token usado e cria
 *   outro na mesma família.
 * - Se um token já revogado aparecer de novo, alguém está usando uma cópia
 *   antiga (possível roubo): a família inteira é revogada.
 * - O banco guarda só o SHA-256 do token. Um vazamento do banco não dá
 *   tokens utilizáveis. (SHA-256 basta aqui: o token tem 256 bits aleatórios,
 *   diferente de uma senha, que precisaria de argon2.)
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Cria um refresh token. Sem familyId, começa uma família nova (login). */
  async issue(
    userId: string,
    userAgent?: string,
    familyId: string = randomUUID(),
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });

    await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(token),
        userAgent: userAgent?.slice(0, 255),
        expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
      },
    });
    return token;
  }

  /** Troca um refresh token válido por um novo. Lança 401 em qualquer problema. */
  async rotate(token: string, userAgent?: string): Promise<{ userId: string; token: string }> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!session) throw new UnauthorizedException('Sessão inválida');

    if (session.revokedAt) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Sessão revogada');
    }
    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sessão expirada');
    }

    // Revoga só se ainda não estiver revogado. Se duas requisições chegarem
    // juntas com o mesmo token, só uma "ganha"; a outra conta como reuso.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Sessão revogada');
    }

    const next = await this.issue(session.userId, userAgent, session.familyId);
    return { userId: session.userId, token: next };
  }

  /** Logout: revoga a família do token (só este dispositivo). */
  async revoke(token: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { familyId: true },
    });
    if (session) await this.revokeFamily(session.familyId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
