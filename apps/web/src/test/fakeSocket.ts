import type { ServerToClientEvents } from '@discord-2/shared';

type Listener = (...args: unknown[]) => void;

/**
 * Socket falso para os testes: guarda os listeners que o app registra e
 * deixa o teste disparar eventos como se viessem do servidor.
 */
class FakeSocket {
  private listeners = new Map<string, Set<Listener>>();
  connected = false;

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  connect(): this {
    this.connected = true;
    this.fire('connect');
    return this;
  }

  disconnect(): this {
    this.connected = false;
    return this;
  }

  /** Simula um evento enviado pelo servidor. */
  serverEmit<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.fire(event, ...args);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  reset(): void {
    this.listeners.clear();
    this.connected = false;
  }

  private fire(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

export const fakeSocket = new FakeSocket();
