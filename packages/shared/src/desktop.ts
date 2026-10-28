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

/** O app pediu para o usuário escolher o que compartilhar. */
export interface PickerRequest {
  requestId: string;
  sources: PickerSource[];
}

export interface DesktopBridge {
  platform: string;
  /** Avisa quando o front deve mostrar o seletor de tela. Devolve a função para parar de ouvir. */
  onScreenPickerRequest: (listener: (request: PickerRequest) => void) => () => void;
  /** Resposta do seletor: o id escolhido, ou null se cancelou. */
  respondScreenPicker: (requestId: string, sourceId: string | null) => void;
}
