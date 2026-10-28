import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../auth/auth.types.js';

/**
 * Rate limit por usuário quando há login, por IP quando não há (login/cadastro).
 * Precisa rodar depois do AuthGuard, que é quem preenche req.user.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const { user, ip } = req as unknown as AuthenticatedRequest;
    return Promise.resolve(user ? `user:${user.id}` : `ip:${ip ?? 'desconhecido'}`);
  }
}
