import { z } from 'zod';

/**
 * Contrato da rota GET /health.
 * O schema é a fonte da verdade: o tipo TypeScript é derivado dele,
 * e o mesmo schema valida a resposta em runtime no cliente.
 */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptime: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
  db: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
