import { apiErrorSchema, authResponseSchema, userSchema } from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, http, newUser, refreshCookie, resetDatabase } from './helpers.js';

/**
 * Fluxo completo de autenticação contra um Postgres real.
 * Um app novo por teste: o rate limit guarda contadores em memória.
 */
describe.runIf(process.env.DB_TESTS === '1')('Auth (Postgres real)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  async function register(overrides: Partial<typeof newUser> = {}) {
    const res = await http(app)
      .post('/api/auth/register')
      .send({ ...newUser, ...overrides })
      .expect(201);
    return { body: authResponseSchema.parse(res.body), cookie: refreshCookie(res)! };
  }

  describe('cadastro', () => {
    it('cria a conta, devolve access token e seta o cookie httpOnly', async () => {
      const res = await http(app).post('/api/auth/register').send(newUser).expect(201);

      const body = authResponseSchema.parse(res.body);
      expect(body.user).toMatchObject({ email: newUser.email, username: newUser.username });
      // Corpo cru (sem passar pelo Zod, que removeria campos extras e esconderia um vazamento)
      const raw = res.body as { user: Record<string, unknown> };
      expect(raw).not.toHaveProperty('refreshToken');
      expect(raw.user).not.toHaveProperty('passwordHash');

      const setCookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(setCookie).toMatch(/^d2_refresh=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(setCookie).toMatch(/Path=\/api\/auth/);
    });

    it('guarda a senha como hash argon2id, nunca em texto puro', async () => {
      await register();

      const user = await app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { email: newUser.email } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(newUser.password);
    });

    it('recusa e-mail e usuário repetidos com 409 e erros por campo', async () => {
      await register();

      const res = await http(app)
        .post('/api/auth/register')
        .send({ ...newUser, email: 'GUI@example.com' })
        .expect(409);

      expect(apiErrorSchema.parse(res.body).fieldErrors).toEqual({
        email: ['E-mail já cadastrado'],
        username: ['Usuário já existe'],
      });
    });

    it('valida o corpo com o schema do shared (400)', async () => {
      const res = await http(app)
        .post('/api/auth/register')
        .send({ ...newUser, password: '123' })
        .expect(400);

      expect(res.body).toMatchObject({
        message: 'Dados inválidos',
        fieldErrors: { password: ['A senha precisa ter pelo menos 8 caracteres'] },
      });
    });
  });

  describe('login', () => {
    it('entra com e-mail (sem diferenciar maiúsculas) e senha corretos', async () => {
      await register();

      const res = await http(app)
        .post('/api/auth/login')
        .send({ email: 'GUI@Example.com', password: newUser.password })
        .expect(200);

      expect(authResponseSchema.parse(res.body).user.username).toBe('gui');
      expect(refreshCookie(res)).toBeDefined();
    });

    it('dá a mesma resposta para senha errada e e-mail inexistente', async () => {
      await register();

      const wrongPassword = await http(app)
        .post('/api/auth/login')
        .send({ email: newUser.email, password: 'senha-errada' })
        .expect(401);
      const unknownEmail = await http(app)
        .post('/api/auth/login')
        .send({ email: 'ninguem@example.com', password: 'senha-errada' })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it('bloqueia com 429 depois de 10 tentativas por minuto', async () => {
      const attempt = () =>
        http(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'errada' });

      for (let i = 0; i < 10; i++) await attempt().expect(401);
      await attempt().expect(429);
    });
  });

  describe('/api/users/me', () => {
    it('devolve o usuário com um access token válido', async () => {
      const { body } = await register();

      const res = await http(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      expect(userSchema.parse(res.body)).toEqual(body.user);
    });

    it('recusa token adulterado', async () => {
      const { body } = await register();
      const tampered = `${body.accessToken.slice(0, -2)}xx`;

      await http(app).get('/api/users/me').set('Authorization', `Bearer ${tampered}`).expect(401);
    });
  });

  describe('refresh', () => {
    it('troca o refresh token por um novo (rotação)', async () => {
      const { cookie } = await register();

      const res = await http(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);

      const next = refreshCookie(res);
      expect(next).toBeDefined();
      expect(next).not.toBe(cookie);
      expect(authResponseSchema.parse(res.body).user.email).toBe(newUser.email);
    });

    it('detecta reuso: usar um token antigo derruba a família inteira', async () => {
      const { cookie: first } = await register();
      const rotated = await http(app).post('/api/auth/refresh').set('Cookie', first).expect(200);
      const second = refreshCookie(rotated)!;

      // Alguém usa a cópia antiga (ex.: token roubado)...
      await http(app).post('/api/auth/refresh').set('Cookie', first).expect(401);

      // ...e o token legítimo mais novo também deixa de funcionar.
      await http(app).post('/api/auth/refresh').set('Cookie', second).expect(401);
    });

    it('não afeta outras sessões do mesmo usuário (outro dispositivo)', async () => {
      const { cookie: laptop } = await register();
      const login = await http(app)
        .post('/api/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);
      const phone = refreshCookie(login)!;

      await http(app).post('/api/auth/refresh').set('Cookie', laptop).expect(200);
      await http(app).post('/api/auth/refresh').set('Cookie', laptop).expect(401); // reuso no laptop

      await http(app).post('/api/auth/refresh').set('Cookie', phone).expect(200);
    });

    it('recusa token expirado', async () => {
      const { cookie } = await register();
      await app
        .get(PrismaService)
        .session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      await http(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('responde 401 sem cookie', async () => {
      await http(app).post('/api/auth/refresh').expect(401);
    });
  });

  describe('logout', () => {
    it('revoga a sessão e limpa o cookie', async () => {
      const { cookie } = await register();

      const res = await http(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);

      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/d2_refresh=;/);
      await http(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('funciona mesmo sem cookie (idempotente)', async () => {
      await http(app).post('/api/auth/logout').expect(204);
    });
  });
});
