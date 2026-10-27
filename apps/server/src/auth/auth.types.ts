import type { Request } from 'express';

/** O que o AuthGuard coloca na requisição depois de validar o access token. */
export interface AuthUser {
  id: string;
}

export interface AccessTokenPayload {
  sub: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export const REFRESH_COOKIE = 'd2_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';
