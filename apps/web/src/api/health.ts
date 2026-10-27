import { healthResponseSchema, type HealthResponse } from '@discord-2/shared';

/**
 * Busca o /health e valida a resposta com o schema do shared.
 * 503 não é erro aqui: o corpo diz o que está fora do ar.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok && res.status !== 503) {
    throw new Error(`Servidor respondeu ${res.status}`);
  }
  return healthResponseSchema.parse(await res.json());
}
