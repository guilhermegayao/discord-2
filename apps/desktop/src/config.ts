/**
 * Endereço do front que o app abre. Em dev, o Vite local; depois da Fase 7,
 * o domínio real. Pode ser trocado sem recompilar com a variável
 * DISCORD2_APP_URL (útil para testar contra outro servidor).
 */
export const DEFAULT_APP_URL = 'http://localhost:5174';

export function resolveAppUrl(env: NodeJS.ProcessEnv = process.env): URL {
  const raw = env.DISCORD2_APP_URL?.trim() || DEFAULT_APP_URL;
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`DISCORD2_APP_URL precisa ser http(s): ${raw}`);
  }
  return url;
}
