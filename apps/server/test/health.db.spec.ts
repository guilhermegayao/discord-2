import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, http } from './helpers.js';

/**
 * Integração com um Postgres de verdade. Roda só com DB_TESTS=1
 * (no CI, que sobe o banco como service container), para que
 * `npm test` local não dependa do Docker estar aberto.
 */
describe.runIf(process.env.DB_TESTS === '1')('GET /api/health com Postgres real', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('conecta no banco e responde 200', async () => {
    const res = await http(app).get('/api/health').expect(200);

    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });
});
