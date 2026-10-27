import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // --- Auth ---
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, { error: 'JWT_ACCESS_SECRET precisa ter pelo menos 32 caracteres' }),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** true em produção (HTTPS). Em dev, http://localhost não aceita cookie Secure em todos os navegadores. */
  COOKIE_SECURE: z.stringbool().default(false),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Usado pelo ConfigModule na inicialização: se faltar ou estiver errada
 * alguma variável, o servidor nem sobe (fail fast) e diz o que corrigir.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
