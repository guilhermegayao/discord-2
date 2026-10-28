import { useState } from 'react';
import { Navigate, NavLink, Outlet, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { CreateChannelModal } from './CreateChannelModal';
import { type GuildContext, useGuildContext } from './guildContext';
import { useDeleteGuild, useGuild } from './hooks';
import { InviteModal } from './InviteModal';
import { useLeaveGuild } from './socialHooks';

/** Coluna de canais de um servidor + o canal aberto. */
export function GuildLayout() {
  const { guildId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const guild = useGuild(guildId);
  const deleteGuild = useDeleteGuild();
  const leaveGuild = useLeaveGuild();
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [inviting, setInviting] = useState(false);

  // data === null: o servidor foi apagado (aqui ou em outra aba, via socket).
  // isError: sem acesso ou id inválido (a API responde 404).
  if (guild.data === null || guild.isError) return <Navigate to="/channels" replace />;
  if (!guild.data) return <aside className="channel-bar" aria-busy="true" />;

  const data = guild.data;
  const isOwner = data.ownerId === user?.id;

  const onDeleteGuild = async () => {
    if (!window.confirm(`Apagar o servidor "${data.name}"? Todas as mensagens serão perdidas.`)) {
      return;
    }
    await deleteGuild.mutateAsync(data.id);
    await navigate('/channels', { replace: true });
  };

  const onLeaveGuild = async () => {
    if (!window.confirm(`Sair do servidor "${data.name}"?`)) return;
    await leaveGuild.mutateAsync(data.id);
    await navigate('/channels', { replace: true });
  };

  return (
    <>
      <aside className="channel-bar">
        <header className="channel-bar__header">
          <h2 title={data.name}>{data.name}</h2>
          <span className="channel-bar__actions">
            <button
              type="button"
              className="icon-button"
              title="Convidar pessoas"
              aria-label="Convidar pessoas"
              onClick={() => setInviting(true)}
            >
              ➕👤
            </button>
            {isOwner ? (
              <button
                type="button"
                className="icon-button"
                title="Apagar servidor"
                aria-label="Apagar servidor"
                onClick={() => void onDeleteGuild()}
              >
                🗑
              </button>
            ) : (
              <button
                type="button"
                className="icon-button"
                title="Sair do servidor"
                aria-label="Sair do servidor"
                onClick={() => void onLeaveGuild()}
              >
                🚪
              </button>
            )}
          </span>
        </header>

        <div className="channel-bar__section">
          <span>Canais de texto</span>
          {isOwner && (
            <button
              type="button"
              className="icon-button"
              title="Criar canal"
              aria-label="Criar canal"
              onClick={() => setCreatingChannel(true)}
            >
              +
            </button>
          )}
        </div>
        <nav aria-label="Canais">
          <ul>
            {data.channels.map((channel) => (
              <li key={channel.id}>
                <NavLink to={`/channels/${data.id}/${channel.id}`} className="channel-link">
                  <span aria-hidden="true">#</span> {channel.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <Outlet context={{ guild: data, isOwner } satisfies GuildContext} />

      {creatingChannel && (
        <CreateChannelModal guildId={data.id} onClose={() => setCreatingChannel(false)} />
      )}
      {inviting && (
        <InviteModal guildId={data.id} guildName={data.name} onClose={() => setInviting(false)} />
      )}
    </>
  );
}

/** /channels/:guildId → primeiro canal do servidor. */
export function GuildIndex() {
  const { guild } = useGuildContext();
  const first = guild.channels[0];
  return first ? <Navigate to={`/channels/${guild.id}/${first.id}`} replace /> : null;
}
