import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Composer } from './Composer';
import { useGuildContext } from './guildContext';
import { useDeleteChannel } from './hooks';
import { MemberList } from './MemberList';
import { MessageList } from './MessageList';

export function ChatView() {
  const { channelId } = useParams();
  const { guild, isOwner } = useGuildContext();
  const navigate = useNavigate();
  const deleteChannel = useDeleteChannel(guild.id);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const channel = guild.channels.find((c) => c.id === channelId && c.type === 'TEXT');

  // Canal apagado (por outra pessoa ou em outra aba) ou de voz: volta para o primeiro de texto.
  if (!channel) return <Navigate to={`/channels/${guild.id}`} replace />;

  const label = `#${channel.name}`;

  const onDeleteChannel = async () => {
    if (!window.confirm(`Apagar o canal ${label}?`)) return;
    try {
      await deleteChannel.mutateAsync(channel.id);
      await navigate(`/channels/${guild.id}`, { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível apagar o canal');
    }
  };

  return (
    <>
      <main className="chat" key={channel.id}>
        <header className="chat__header">
          <h1>
            <span aria-hidden="true">#</span> {channel.name}
          </h1>
          {isOwner && (
            <button
              type="button"
              className="icon-button"
              title="Apagar canal"
              aria-label="Apagar canal"
              onClick={() => void onDeleteChannel()}
            >
              🗑
            </button>
          )}
          {deleteError && (
            <span className="form-error" role="alert">
              {deleteError}
            </span>
          )}
        </header>
        <MessageList
          channelId={channel.id}
          label={label}
          welcome={`Boas-vindas a ${label}!`}
          canModerate={isOwner}
        />
        <Composer channelId={channel.id} label={label} />
      </main>
      <MemberList guildId={guild.id} ownerId={guild.ownerId} />
    </>
  );
}
