import { healthResponseSchema } from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, http } from './helpers.js';

/**
 * Sobe o app Nest inteiro (módulos, guards, controller) e testa via HTTP,
 * trocando só o acesso ao banco por um dublê.
 */
function createApp(queryRaw: () => Promise<unknown>): Promise<INestApplication> {
  return createTestApp((b) =>
    b
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn(queryRaw), $disconnect: vi.fn() }),
  );
}

describe('GET /api/health', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('responde 200 com o contrato do shared quando o banco está de pé', async () => {
    app = await createApp(() => Promise.resolve([]));

    const res = await http(app).get('/api/health').expect(200);

    expect(healthResponseSchema.parse(res.body)).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('responde 503 quando o banco está fora', async () => {
    app = await createApp(() => Promise.reject(new Error('down')));

    const res = await http(app).get('/api/health').expect(503);

    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('é pública (não exige token)', async () => {
    app = await createApp(() => Promise.resolve([]));

    await http(app).get('/api/health').expect(200);
  });

  it('rotas sem @Public() exigem token', async () => {
    app = await createApp(() => Promise.resolve([]));

    const res = await http(app).get('/api/users/me').expect(401);

    expect(res.body).toMatchObject({ message: 'Token de acesso ausente' });
  });
});
