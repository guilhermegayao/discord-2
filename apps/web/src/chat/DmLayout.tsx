import { Navigate, NavLink, Outlet, useParams } from 'react-router';
import { initials } from './format';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { isOnline, useDms, usePresence } from './socialHooks';
import { VoicePanel } from '../voice/VoicePanel';

/** /channels/@me — lista de conversas diretas + a conversa aberta. */
export function DmLayout() {
  const dms = useDms();
  const presence = usePresence();

  return (
    <>
      <aside className="channel-bar">
        <header className="channel-bar__header">
          <h2>Mensagens diretas</h2>
        </header>
        <nav aria-label="Conversas">
          {dms.data?.length === 0 && (
            <p className="muted dm-empty">
              Nenhuma conversa ainda. Abra uma pela lista de membros de um servidor (💬).
            </p>
          )}
          <ul>
            {dms.data?.map((dm) => {
              const online = isOnline(presence, dm.recipient.id, dm.recipientOnline);
              return (
                <li key={dm.id}>
                  <NavLink to={`/channels/@me/${dm.id}`} className="channel-link dm-link">
                    <span className="avatar avatar--small">
                      {initials(dm.recipient.displayName)}
                      <span
                        className={`status-dot status-dot--${online ? 'online' : 'offline'}`}
                        role="img"
                        aria-label={online ? 'online' : 'offline'}
                      />
                    </span>
                    {dm.recipient.displayName}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
        {/* A voz continua conectada lendo DMs; o painel fica no mesmo lugar. */}
        <VoicePanel />
      </aside>
      <Outlet />
    </>
  );
}

export function DmHome() {
  return (
    <main className="empty">
      <div className="empty__content">
        <h1>Suas conversas</h1>
        <p className="muted">Escolha uma conversa à esquerda.</p>
      </div>
    </main>
  );
}

export function DmChatView() {
  const { channelId } = useParams();
  const dms = useDms();
  const presence = usePresence();
  const dm = dms.data?.find((d) => d.id === channelId);

  if (dms.isPending) return <main className="chat" aria-busy="true" />;
  if (!dm) return <Navigate to="/channels/@me" replace />;

  const label = `@${dm.recipient.displayName}`;
  const online = isOnline(presence, dm.recipient.id, dm.recipientOnline);

  return (
    <main className="chat" key={dm.id}>
      <header className="chat__header">
        <h1>
          <span aria-hidden="true">@</span> {dm.recipient.displayName}
        </h1>
        <span className="muted">{online ? 'online' : 'offline'}</span>
      </header>
      <MessageList
        channelId={dm.id}
        label={label}
        welcome={`Conversa com ${dm.recipient.displayName}`}
        canModerate={false}
      />
      <Composer channelId={dm.id} label={label} />
    </main>
  );
}
