import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload, AuthenticatedRequest } from './auth.types.js';
import { IS_PUBLIC_KEY } from './decorators.js';

/**
 * Guard global: exige "Authorization: Bearer <access token>" em toda rota,
 * exceto nas marcadas com @Public(). Seguro por padrão: esquecer o decorator
 * deixa a rota fechada, não aberta.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Guards globais também rodam nos handlers do WebSocket. Lá a autenticação
    // já aconteceu no handshake (RealtimeGateway), então este guard é só HTTP.
    if (ctx.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      req.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado');
    }
  }
}
