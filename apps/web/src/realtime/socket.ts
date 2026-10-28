import type { ClientToServerEvents, ServerToClientEvents } from '@discord-2/shared';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, refreshSession } from '../api/client';

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ChatSocket | null = null;

/**
 * Socket único do app. O token vai como função no `auth`: a cada
 * (re)conexão o Socket.IO pede o token atual, então depois de um refresh
 * a próxima reconexão já usa o token novo.
 */
export function getSocket(): ChatSocket {
  if (socket) return socket;

  const created: ChatSocket = io({
    path: '/api/socket.io',
    autoConnect: false,
    auth: (cb) => cb({ token: getAccessToken() }),
  });

  // Token expirado no handshake: renova a sessão e tenta de novo uma vez.
  let retried = false;
  created.on('connect', () => {
    retried = false;
  });
  created.on('connect_error', (err) => {
    if (err.message !== 'unauthorized' || retried) return;
    retried = true;
    void refreshSession().then((session) => {
      if (session) created.connect();
    });
  });

  socket = created;
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
