import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ApiError, AuthResponse, LoginData, RegisterData } from '@discord-2/shared';
import argon2 from 'argon2';
import { Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserDto } from '../users/users.service.js';
import type { AccessTokenPayload } from './auth.types.js';
import { SessionsService } from './sessions.service.js';

/** O que o controller recebe: a resposta pública + o refresh token, que vai para o cookie. */
export type AuthResult = AuthResponse & { refreshToken: string };

@Injectable()
export class AuthService {
  /**
   * Hash de uma senha qualquer, usado quando o e-mail não existe. Assim o
   * login demora o mesmo tanto com ou sem conta, e o tempo de resposta não
   * revela quais e-mails estão cadastrados.
   */
  private readonly dummyHash = argon2.hash('senha-inexistente-para-equalizar-tempo');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async register(data: RegisterData, userAgent?: string): Promise<AuthResult> {
    await this.assertAvailable(data.email, data.username);

    const passwordHash = await argon2.hash(data.password);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: data.email,
          username: data.username,
          displayName: data.displayName,
          passwordHash,
        },
      });
    } catch (err) {
      // Duas pessoas cadastrando o mesmo e-mail ao mesmo tempo: o índice único do banco segura.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('E-mail ou usuário já cadastrado');
      }
      throw err;
    }

    return this.startSession(user, userAgent);
  }

  async login(data: LoginData, userAgent?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    const valid = user
      ? await argon2.verify(user.passwordHash, data.password)
      : await argon2.verify(await this.dummyHash, data.password).then(() => false);

    if (!user || !valid) throw new UnauthorizedException('E-mail ou senha incorretos');

    return this.startSession(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<AuthResult> {
    const { userId, token } = await this.sessions.rotate(refreshToken, userAgent);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Sessão inválida');

    return {
      accessToken: await this.signAccessToken(user.id),
      user: toUserDto(user),
      refreshToken: token,
    };
  }

  logout(refreshToken: string): Promise<void> {
    return this.sessions.revoke(refreshToken);
  }

  private async startSession(user: User, userAgent?: string): Promise<AuthResult> {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user.id),
      this.sessions.issue(user.id, userAgent),
    ]);
    return { accessToken, user: toUserDto(user), refreshToken };
  }

  private signAccessToken(userId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId };
    return this.jwt.signAsync(payload);
  }

  private async assertAvailable(email: string, username: string): Promise<void> {
    const taken = await this.prisma.user.findMany({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (taken.length === 0) return;

    const fieldErrors: Record<string, string[]> = {};
    if (taken.some((u) => u.email === email)) fieldErrors.email = ['E-mail já cadastrado'];
    if (taken.some((u) => u.username === username)) fieldErrors.username = ['Usuário já existe'];

    const body: ApiError = {
      statusCode: 409,
      message: 'E-mail ou usuário já cadastrado',
      fieldErrors,
    };
    throw new ConflictException(body);
  }
}
