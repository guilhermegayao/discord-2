import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('aceita uma resposta válida', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      uptime: 12.5,
      timestamp: new Date().toISOString(),
      db: 'up',
    });

    expect(result.success).toBe(true);
  });

  it('rejeita status desconhecido', () => {
    const result = healthResponseSchema.safeParse({
      status: 'broken',
      uptime: 1,
      timestamp: new Date().toISOString(),
      db: 'up',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita uptime negativo e timestamp inválido', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      uptime: -1,
      timestamp: 'ontem',
      db: 'up',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['uptime', 'timestamp']);
  });
});
