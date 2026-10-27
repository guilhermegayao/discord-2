import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthResponse,
  type LoginData,
  loginSchema,
  type RegisterData,
  registerSchema,
} from '@discord-2/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Env } from '../config/env.js';
import { AuthService, type AuthResult } from './auth.service.js';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.types.js';
import { Public } from './decorators.js';

/** Limite mais apertado contra tentativa de senha por força bruta. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterData,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.register(body, req.get('user-agent')));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginData,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(body, req.get('user-agent')));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = this.readCookie(req);
    if (!token) throw new UnauthorizedException('Sessão ausente');
    try {
      return this.respond(res, await this.auth.refresh(token, req.get('user-agent')));
    } catch (err) {
      // Token inválido: limpa o cookie para o navegador parar de mandá-lo.
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = this.readCookie(req);
    if (token) await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private respond(res: Response, { refreshToken, ...body }: AuthResult): AuthResponse {
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      maxAge: days * 24 * 60 * 60 * 1000,
    });
    return body;
  }

  private readCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  /**
   * httpOnly: JavaScript da página não lê o cookie (protege contra XSS).
   * sameSite=lax: o navegador não manda o cookie em POST vindo de outro site (CSRF).
   * path: o cookie só viaja para /api/auth/*, não em toda requisição.
   */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      path: REFRESH_COOKIE_PATH,
    };
  }
}
