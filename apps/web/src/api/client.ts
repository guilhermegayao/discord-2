import {
  type ApiError,
  apiErrorSchema,
  type AuthResponse,
  authResponseSchema,
} from '@discord-2/shared';
import type { z } from 'zod';

/** Erro de uma chamada à API, com o corpo padronizado do servidor. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message);
  }
}

/**
 * O access token vive só na memória (nunca no localStorage): um script
 * injetado na página (XSS) não encontra um token guardado para roubar.
 * Ao recarregar a página ele some, e o AuthProvider pede outro via refresh.
 */
let accessToken: string | null = null;
const sessionExpiredListeners = new Set<() => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Usado pelo socket, que manda o token no handshake de cada (re)conexão. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Avisa quando a sessão morreu no meio do uso (refresh recusado). */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

let refreshInFlight: Promise<AuthResponse | null> | null = null;

/**
 * Troca o refresh token (cookie httpOnly) por um access token novo.
 *
 * O servidor rotaciona o refresh token a cada uso e trata uso repetido como
 * roubo. Por isso nunca podemos mandar o mesmo cookie duas vezes ao mesmo tempo:
 * - na mesma aba: chamadas simultâneas compartilham a mesma promise (single-flight);
 * - entre abas: a Web Locks API faz uma aba esperar a outra terminar. Como o
 *   cookie é compartilhado, a segunda aba já usa o token novo.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= withCrossTabLock(doRefresh).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request('d2-auth-refresh', fn);
  }
  return fn();
}

async function doRefresh(): Promise<AuthResponse | null> {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  if (res.status === 401) {
    setAccessToken(null);
    return null;
  }
  if (!res.ok) throw await toError(res);
  const data = authResponseSchema.parse(await res.json());
  setAccessToken(data.accessToken);
  return data;
}

interface RequestOptions<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  schema?: S;
}

/**
 * fetch com o access token. Se a API responder 401, tenta renovar a sessão
 * uma vez e repete a chamada; se não der, avisa que a sessão expirou.
 */
export async function api<S extends z.ZodType>(
  path: string,
  { method = 'GET', body, schema }: RequestOptions<S> = {},
): Promise<z.output<S>> {
  const send = () =>
    fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && accessToken) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      sessionExpiredListeners.forEach((listener) => listener());
      throw await toError(res);
    }
    res = await send();
  }

  if (!res.ok) throw await toError(res);
  if (!schema || res.status === 204) return undefined as z.output<S>;
  return schema.parse(await res.json());
}

async function toError(res: Response): Promise<ApiRequestError> {
  const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
  return new ApiRequestError(
    res.status,
    parsed.success ? parsed.data : { statusCode: res.status, message: `Erro ${res.status}` },
  );
}
