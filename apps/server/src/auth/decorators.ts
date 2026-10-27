import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth.types.js';

export const IS_PUBLIC_KEY = 'isPublic';

/** Libera a rota do AuthGuard global. Toda rota é protegida por padrão. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injeta o usuário autenticado: `me(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.user) throw new Error('@CurrentUser usado em rota pública');
  return req.user;
});
