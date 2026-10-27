import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/**
 * Integração com um Postgres de verdade. Roda só com DB_TESTS=1
 * (no CI, que sobe o banco como service container), para que
 * `npm test` local não dependa do Docker estar aberto.
 */
describe.runIf(process.env.DB_TESTS === '1')('GET /health com Postgres real', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('conecta no banco e responde 200', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });
});
