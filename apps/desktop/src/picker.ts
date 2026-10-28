import type { PickerSource } from '@discord-2/shared';

/** O que importa de um DesktopCapturerSource do Electron (facilita testar sem Electron). */
export interface CapturerSourceLike {
  id: string;
  name: string;
  thumbnail: { toDataURL(): string; isEmpty(): boolean };
  appIcon: { toDataURL(): string; isEmpty(): boolean } | null;
}

/**
 * Monta a lista do seletor: telas primeiro, depois janelas com prévia e por
 * último as sem prévia. Tira a própria janela do app (compartilhá-la dá o
 * efeito "espelho infinito") e janelas sem nome.
 *
 * Janelas sem prévia continuam na lista: o Windows não gera miniatura de
 * janela minimizada nem de muitos jogos em tela cheia, e são justamente
 * eles que a gente quer compartilhar.
 */
export function toPickerSources(
  sources: CapturerSourceLike[],
  ownWindowSourceId: string | null,
): PickerSource[] {
  const rank = (s: PickerSource) => (s.kind === 'screen' ? 0 : s.thumbnail ? 1 : 2);
  return sources
    .filter((s) => s.id !== ownWindowSourceId)
    .filter((s) => s.name.trim() !== '')
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    }))
    .sort((a, b) => rank(a) - rank(b));
}

interface Pending {
  allowed: Set<string>;
  resolve: (sourceId: string | null) => void;
  timer: NodeJS.Timeout;
}

/**
 * Liga o pedido de captura (processo principal) à resposta do seletor
 * (página). Só aceita como resposta um id que estava na lista oferecida:
 * a página não consegue pedir uma fonte que o usuário não viu.
 */
export class PickerBroker {
  private readonly pending = new Map<string, Pending>();
  private counter = 0;

  constructor(private readonly timeoutMs = 2 * 60_000) {}

  /** Abre um pedido; `send` entrega o pedido à página. Resolve com o id escolhido ou null. */
  request(sources: PickerSource[], send: (requestId: string) => void): Promise<string | null> {
    const requestId = `pick-${++this.counter}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.respond(requestId, null), this.timeoutMs);
      this.pending.set(requestId, { allowed: new Set(sources.map((s) => s.id)), resolve, timer });
      send(requestId);
    });
  }

  respond(requestId: string, sourceId: string | null): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    clearTimeout(entry.timer);
    entry.resolve(sourceId !== null && entry.allowed.has(sourceId) ? sourceId : null);
  }

  /** Cancela tudo (ex.: a janela fechou). */
  cancelAll(): void {
    for (const id of [...this.pending.keys()]) this.respond(id, null);
  }
}
