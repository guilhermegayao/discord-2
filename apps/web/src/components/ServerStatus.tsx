import type { HealthResponse } from '@discord-2/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchHealth } from '../api/health';

type State =
  | { kind: 'loading' }
  | { kind: 'online'; health: HealthResponse }
  | { kind: 'offline'; message: string };

export function ServerStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  // Só atualiza o estado nos callbacks da promise (nunca de forma síncrona
  // dentro do useEffect, o que causaria um render em cascata).
  const load = useCallback((signal?: AbortSignal) => {
    fetchHealth(signal)
      .then((health) => setState({ kind: 'online', health }))
      .catch((err: unknown) => {
        if (signal?.aborted) return;
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setState({ kind: 'offline', message });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const retry = () => {
    setState({ kind: 'loading' });
    load();
  };

  return (
    <section className="status" aria-live="polite">
      <h2>Status</h2>
      {state.kind === 'loading' && <p>Verificando servidor…</p>}
      {state.kind === 'offline' && (
        <p>
          <span className="dot dot--down" /> Servidor: offline ({state.message})
        </p>
      )}
      {state.kind === 'online' && (
        <ul>
          <li>
            <span className="dot dot--up" /> Servidor: online
          </li>
          <li>
            <span className={`dot ${state.health.db === 'up' ? 'dot--up' : 'dot--down'}`} /> Banco:{' '}
            {state.health.db}
          </li>
          <li className="muted">Uptime: {Math.round(state.health.uptime)}s</li>
        </ul>
      )}
      <button type="button" onClick={retry} disabled={state.kind === 'loading'}>
        Verificar de novo
      </button>
    </section>
  );
}
