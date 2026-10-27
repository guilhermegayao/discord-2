import { healthResponseSchema } from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Sobe o app Nest inteiro (módulos, controller, pipes) e testa via HTTP,
 * trocando só o acesso ao banco por um dublê.
 */
async function createApp(queryRaw: () => Promise<unknown>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: vi.fn(queryRaw), $disconnect: vi.fn() })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('GET /health', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('responde 200 com o contrato do shared quando o banco está de pé', async () => {
    app = await createApp(() => Promise.resolve([]));

    const res = await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200);

    expect(healthResponseSchema.parse(res.body)).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('responde 503 quando o banco está fora', async () => {
    app = await createApp(() => Promise.reject(new Error('down')));

    const res = await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(503);

    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
