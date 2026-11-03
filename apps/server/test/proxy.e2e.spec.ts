import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, http } from './helpers.js';

/**
 * Em produção o servidor fica atrás do Caddy. O rate limit de login precisa
 * enxergar o IP de cada pessoa (X-Forwarded-For), e não o do proxy.
 */
function createApp(trustProxy: boolean): Promise<INestApplication> {
  return createTestApp(
    (b) =>
      b.overrideProvider(PrismaService).useValue({
        user: { findUnique: vi.fn(() => Promise.resolve(null)) },
        $disconnect: vi.fn(),
      }),
    { trustProxy },
  );
}

const login = (app: INestApplication, ip: string) =>
  http(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email: 'ninguem@example.com', password: 'senha-errada' });

describe('rate limit atrás do proxy', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('com TRUST_PROXY, cada IP real tem o seu limite', async () => {
    app = await createApp(true);

    for (let i = 0; i < 10; i++) await login(app, '203.0.113.1').expect(401);
    await login(app, '203.0.113.1').expect(429);
    await login(app, '203.0.113.2').expect(401);
  });

  it('sem TRUST_PROXY, o cabeçalho é ignorado (não dá para fugir do limite forjando IP)', async () => {
    app = await createApp(false);

    for (let i = 0; i < 10; i++) await login(app, `198.51.100.${i}`).expect(401);
    await login(app, '198.51.100.99').expect(429);
  });
});
