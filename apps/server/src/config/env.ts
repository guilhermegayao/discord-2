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

  // --- Tempo real ---
  /** Quanto tempo esperar sem nenhuma aba conectada antes de marcar offline (evita "piscar" no F5). */
  PRESENCE_GRACE_MS: z.coerce.number().int().nonnegative().default(5000),

  // --- Voz (LiveKit) ---
  /** Endereço que o navegador usa (ws:// em dev, wss:// em produção). */
  LIVEKIT_URL: z.url({ protocol: /^wss?$/ }),
  /** Endereço que o servidor usa para a API do LiveKit. Padrão: o LIVEKIT_URL em http(s). */
  LIVEKIT_API_URL: z.url({ protocol: /^https?$/ }).optional(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z
    .string()
    .min(32, { error: 'LIVEKIT_API_SECRET precisa ter pelo menos 32 caracteres' }),
  /** Ao subir, pergunta ao LiveKit quem já está na voz (desligado nos testes). */
  LIVEKIT_SYNC_ON_START: z.stringbool().default(true),
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
