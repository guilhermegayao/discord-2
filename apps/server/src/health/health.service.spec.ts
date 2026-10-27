import { healthResponseSchema } from '@discord-2/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

function makeService(queryRaw: () => Promise<unknown>): HealthService {
  const prisma = { $queryRaw: vi.fn(queryRaw) } as unknown as PrismaService;
  return new HealthService(prisma);
}

describe('HealthService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna ok quando o banco responde', async () => {
    const result = await makeService(() => Promise.resolve([{ '?column?': 1 }])).check();

    expect(result).toMatchObject({ status: 'ok', db: 'up' });
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
  });

  it('retorna degraded quando a consulta falha', async () => {
    const result = await makeService(() => Promise.reject(new Error('ECONNREFUSED'))).check();

    expect(result).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('retorna degraded quando o banco demora demais', async () => {
    vi.useFakeTimers();
    const pending = makeService(() => new Promise(() => {})).check();

    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toMatchObject({ status: 'degraded', db: 'down' });
  });
});
