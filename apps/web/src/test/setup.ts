import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setAccessToken } from '../api/client';
import { server } from './server';

// Requisição sem handler é erro: o teste nunca fala com uma API de verdade por acidente.
// (No MSW 3 a opção se chama onUnhandledFrame; o antigo onUnhandledRequest é ignorado.)
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  setAccessToken(null);
  vi.restoreAllMocks();
});

afterAll(() => server.close());
