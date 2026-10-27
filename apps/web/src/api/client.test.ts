import { userSchema } from '@discord-2/shared';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { authResponse, server, testUser, unauthorized } from '../test/server';
import { api, ApiRequestError, onSessionExpired, refreshSession, setAccessToken } from './client';

describe('refreshSession', () => {
  it('faz uma única requisição mesmo com várias chamadas simultâneas (single-flight)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/auth/refresh', async () => {
        calls++;
        await delay(20);
        return HttpResponse.json(authResponse());
      }),
    );

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(calls).toBe(1);
    expect(results.every((r) => r?.user.id === testUser.id)).toBe(true);
  });

  it('devolve null quando não há sessão', async () => {
    await expect(refreshSession()).resolves.toBeNull();
  });
});

describe('api()', () => {
  it('manda o access token no header Authorization', async () => {
    setAccessToken('token-atual');
    server.use(
      http.get('/api/users/me', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer token-atual'
          ? HttpResponse.json(testUser)
          : unauthorized(),
      ),
    );

    await expect(api('/users/me', { schema: userSchema })).resolves.toEqual(testUser);
  });

  it('com token expirado: renova a sessão e repete a chamada com o token novo', async () => {
    setAccessToken('token-velho');
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json(authResponse('token-novo'))),
      http.get('/api/users/me', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer token-novo'
          ? HttpResponse.json(testUser)
          : unauthorized('Token de acesso inválido ou expirado'),
      ),
    );

    await expect(api('/users/me', { schema: userSchema })).resolves.toEqual(testUser);
  });

  it('se o refresh também falhar, avisa que a sessão expirou e lança 401', async () => {
    setAccessToken('token-velho');
    server.use(http.get('/api/users/me', () => unauthorized('Token expirado')));
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);

    const error = await api('/users/me').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(401);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('transforma o corpo de erro da API em ApiRequestError com fieldErrors', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'Conflito',
            fieldErrors: { email: ['E-mail já cadastrado'] },
          },
          { status: 409 },
        ),
      ),
    );

    const error = (await api('/auth/register', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    )) as ApiRequestError;

    expect(error.status).toBe(409);
    expect(error.body.fieldErrors).toEqual({ email: ['E-mail já cadastrado'] });
  });
});
