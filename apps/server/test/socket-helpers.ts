import type { ClientToServerEvents, ServerToClientEvents } from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { expect } from 'vitest';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

/**
 * Clientes Socket.IO de verdade contra o app escutando numa porta aleatória.
 * Guarde o retorno de `socketTestKit` num `let` e chame `closeAll()` no afterEach.
 */
export async function socketTestKit(app: INestApplication) {
  await app.listen(0);
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  const url = `http://localhost:${port}`;
  const sockets: ClientSocket[] = [];

  function connect(token?: string): ClientSocket {
    const socket: ClientSocket = io(url, {
      path: '/api/socket.io',
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  return {
    connect,
    /** Conecta e espera o servidor terminar de colocar o socket nas salas. */
    async connectReady(token: string): Promise<ClientSocket> {
      const socket = connect(token);
      await connected(socket);
      // O join nas salas é assíncrono no servidor (consulta o banco); um respiro curto basta.
      await sleep(50);
      return socket;
    },
    closeAll() {
      sockets.splice(0).forEach((s) => s.disconnect());
    },
  };
}

export function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Espera o próximo evento (ou falha depois de um tempo). */
export function next<E extends EventName>(
  socket: ClientSocket,
  event: E,
  timeoutMs = 2000,
): Promise<Payload<E>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`não chegou ${event}`)), timeoutMs);
    const listener = (payload: Payload<E>) => {
      clearTimeout(timer);
      resolve(payload);
    };
    // O socket.io-client tipa o listener por evento; aqui o evento é genérico.
    socket.once(event, listener as never);
  });
}

/** Coleta todos os eventos de um tipo que chegarem até `stop()` ser chamado. */
export function collect<E extends EventName>(socket: ClientSocket, event: E) {
  const received: Payload<E>[] = [];
  const listener = (payload: Payload<E>) => received.push(payload);
  socket.on(event, listener as never);
  return {
    received,
    stop: () => socket.off(event, listener as never),
  };
}

/** Garante que um evento NÃO chega dentro de uma janela de tempo. */
export async function expectNothing(socket: ClientSocket, event: EventName, windowMs = 300) {
  const { received, stop } = collect(socket, event);
  await sleep(windowMs);
  stop();
  expect(received).toEqual([]);
}
