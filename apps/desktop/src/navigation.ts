/**
 * Regras de navegação da janela. A página carregada é um site; ela nunca
 * pode virar "outro site" dentro do app (um link malicioso não pode abrir
 * uma página falsa de login dentro da nossa janela, por exemplo).
 */

/** Mesmo protocolo, host e porta do app? */
export function isAppUrl(target: string, appUrl: URL): boolean {
  try {
    return new URL(target).origin === appUrl.origin;
  } catch {
    return false;
  }
}

/** Links externos só abrem no navegador do sistema se forem http(s). */
export function isSafeExternalUrl(target: string): boolean {
  try {
    const { protocol } = new URL(target);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Permissões que a página pode pedir: microfone e captura de tela, e só do próprio app. */
const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'fullscreen',
  'clipboard-sanitized-write',
]);

export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  appUrl: URL,
): boolean {
  return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingUrl, appUrl);
}
