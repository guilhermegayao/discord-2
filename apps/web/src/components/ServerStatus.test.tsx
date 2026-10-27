import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { ServerStatus } from './ServerStatus';

const healthy = {
  status: 'ok',
  uptime: 42,
  timestamp: new Date().toISOString(),
  db: 'up',
};

function respondWith(status: number, body: Record<string, unknown>) {
  server.use(http.get('/api/health', () => HttpResponse.json(body, { status })));
}

describe('<ServerStatus />', () => {
  it('mostra servidor online e banco up', async () => {
    respondWith(200, healthy);

    render(<ServerStatus />);

    expect(await screen.findByText('Servidor: online')).toBeInTheDocument();
    expect(screen.getByText(/Banco:/)).toHaveTextContent('Banco: up');
  });

  it('mostra banco down quando o servidor responde 503', async () => {
    respondWith(503, { ...healthy, status: 'degraded', db: 'down' });

    render(<ServerStatus />);

    expect(await screen.findByText(/Banco:/)).toHaveTextContent('Banco: down');
  });

  it('mostra offline quando o servidor não responde', async () => {
    server.use(http.get('/api/health', () => HttpResponse.error()));

    render(<ServerStatus />);

    expect(await screen.findByText(/Servidor: offline/)).toBeInTheDocument();
  });

  it('mostra offline quando a resposta não segue o contrato', async () => {
    respondWith(200, { status: 'ok' });

    render(<ServerStatus />);

    expect(await screen.findByText(/Servidor: offline/)).toBeInTheDocument();
  });
});
