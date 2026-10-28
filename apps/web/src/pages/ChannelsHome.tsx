import { Navigate } from 'react-router';
import { useGuilds } from '../chat/hooks';
import { ServerStatus } from '../components/ServerStatus';

/** /channels: vai para o primeiro servidor, ou mostra o estado vazio. */
export function ChannelsHome() {
  const guilds = useGuilds();

  if (guilds.isPending) return <main className="empty" aria-busy="true" />;

  const first = guilds.data?.[0];
  if (first) return <Navigate to={`/channels/${first.id}`} replace />;

  return (
    <main className="empty">
      <div className="empty__content">
        <h1>Você ainda não está em nenhum servidor</h1>
        <p className="muted">
          Clique no <strong>+</strong> na barra da esquerda para criar o primeiro.
        </p>
        <ServerStatus />
      </div>
    </main>
  );
}
