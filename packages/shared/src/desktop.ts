/**
 * Contrato da ponte entre o app desktop (Electron) e o front.
 * O front roda igual no navegador e no app; quando está no app, o
 * `window.desktop` existe e oferece estas funções (e só estas).
 */

/** Uma tela ou janela que pode ser compartilhada. */
export interface PickerSource {
  /** Id do Electron (desktopCapturer), devolvido na escolha. */
  id: string;
  name: string;
  kind: 'screen' | 'window';
  /**
   * Miniatura em data URL (PNG), ou null quando o Windows não dá prévia
   * (janela minimizada, muitos jogos em tela cheia). Mesmo assim dá para compartilhar.
   */
  thumbnail: string | null;
  /** Ícone do programa da janela, quando houver. */
  appIcon: string | null;
}

/**
 * Tipo da mensagem (window.postMessage) com que o preload entrega à página o
 * MessagePort do som do PC. Um MessagePort não passa pelo contextBridge,
 * então ele chega como mensagem da própria janela.
 */
export const SYSTEM_AUDIO_MESSAGE = 'discord-2:system-audio';

/** O app pediu para o usuário escolher o que compartilhar. */
export interface PickerRequest {
  requestId: string;
  sources: PickerSource[];
  /** Se dá para incluir o som do PC (Windows 11 com o módulo nativo). */
  systemAudio: boolean;
}

export interface DesktopBridge {
  platform: string;
  /** Avisa quando o front deve mostrar o seletor de tela. Devolve a função para parar de ouvir. */
  onScreenPickerRequest: (listener: (request: PickerRequest) => void) => () => void;
  /**
   * Resposta do seletor: o id escolhido (ou null se cancelou) e se é para
   * incluir o som do PC. O áudio chega depois por um MessagePort
   * (ver `onSystemAudioPort` no front).
   */
  respondScreenPicker: (requestId: string, sourceId: string | null, includeAudio: boolean) => void;
}
