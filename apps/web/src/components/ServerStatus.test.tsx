import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServerStatus } from './ServerStatus';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const healthy = {
  status: 'ok',
  uptime: 42,
  timestamp: new Date().toISOString(),
  db: 'up',
};

describe('<ServerStatus />', () => {
  it('mostra servidor online e banco up', async () => {
    const fetchMock = mockFetch(200, healthy);

    render(<ServerStatus />);

    expect(await screen.findByText('Servidor: online')).toBeInTheDocument();
    expect(screen.getByText(/Banco:/)).toHaveTextContent('Banco: up');
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('mostra banco down quando o servidor responde 503', async () => {
    mockFetch(503, { ...healthy, status: 'degraded', db: 'down' });

    render(<ServerStatus />);

    expect(await screen.findByText(/Banco:/)).toHaveTextContent('Banco: down');
  });

  it('mostra offline quando o servidor não responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<ServerStatus />);

    expect(await screen.findByText(/Servidor: offline/)).toHaveTextContent('Failed to fetch');
  });

  it('mostra offline quando a resposta não segue o contrato', async () => {
    mockFetch(200, { status: 'ok' });

    render(<ServerStatus />);

    expect(await screen.findByText(/Servidor: offline/)).toBeInTheDocument();
  });
});
