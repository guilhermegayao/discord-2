import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setAccessToken } from '../api/client';
import { fakeSocket } from './fakeSocket';
import { server } from './server';

// Nenhum teste abre conexão de verdade: o app recebe o socket falso.
vi.mock('../realtime/socket', () => ({
  getSocket: () => fakeSocket,
  disconnectSocket: () => fakeSocket.disconnect(),
}));

// Requisição sem handler é erro: o teste nunca fala com uma API de verdade por acidente.
// (No MSW 3 a opção se chama onUnhandledFrame; o antigo onUnhandledRequest é ignorado.)
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  setAccessToken(null);
  fakeSocket.reset();
  vi.restoreAllMocks();
});

afterAll(() => server.close());
