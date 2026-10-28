import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../auth/auth.types.js';

/**
 * Rate limit por usuário quando há login, por IP quando não há (login/cadastro).
 * Precisa rodar depois do AuthGuard, que é quem preenche req.user.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // Só HTTP. Eventos do WebSocket têm limite próprio no gateway
    // (este guard leria a requisição HTTP, que não existe no socket).
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const { user, ip } = req as unknown as AuthenticatedRequest;
    return Promise.resolve(user ? `user:${user.id}` : `ip:${ip ?? 'desconhecido'}`);
  }
}
