import { type DesktopBridge, SYSTEM_AUDIO_MESSAGE } from '@discord-2/shared';

/**
 * A ponte do app desktop, se o front estiver rodando dentro dele.
 * No navegador comum, `window.desktop` não existe e isto devolve undefined.
 */
export function getDesktopBridge(): DesktopBridge | undefined {
  return (window as Window & { desktop?: DesktopBridge }).desktop;
}

/**
 * Avisa quando o app desktop entrega o canal do som do PC (depois de o
 * usuário marcar "Incluir som do PC" no seletor). O canal chega como
 * mensagem da própria janela, porque um MessagePort não passa pelo
 * contextBridge. Devolve a função para parar de ouvir.
 */
export function onSystemAudioPort(listener: (port: MessagePort) => void): () => void {
  const handler = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if ((event.data as { type?: unknown } | null)?.type !== SYSTEM_AUDIO_MESSAGE) return;
    const [port] = event.ports;
    if (port) listener(port);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
