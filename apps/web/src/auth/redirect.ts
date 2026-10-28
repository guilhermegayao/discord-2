/**
 * Para onde voltar depois do login/cadastro (ex.: o link de convite que a
 * pessoa abriu deslogada). Só aceita caminhos internos: "//site.com" ou
 * "https://..." seriam um open redirect.
 */
export function redirectTarget(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}
