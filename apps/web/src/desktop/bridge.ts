import type { DesktopBridge } from '@discord-2/shared';

/**
 * A ponte do app desktop, se o front estiver rodando dentro dele.
 * No navegador comum, `window.desktop` não existe e isto devolve undefined.
 */
export function getDesktopBridge(): DesktopBridge | undefined {
  return (window as Window & { desktop?: DesktopBridge }).desktop;
}
