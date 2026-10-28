import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Composer } from './Composer';
import { useGuildContext } from './guildContext';
import { useDeleteChannel } from './hooks';
import { MessageList } from './MessageList';

export function ChatView() {
  const { channelId } = useParams();
  const { guild, isOwner } = useGuildContext();
  const navigate = useNavigate();
  const deleteChannel = useDeleteChannel(guild.id);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const channel = guild.channels.find((c) => c.id === channelId);

  // Canal apagado (por outra pessoa ou em outra aba): volta para o primeiro canal.
  if (!channel) return <Navigate to={`/channels/${guild.id}`} replace />;

  const onDeleteChannel = async () => {
    if (!window.confirm(`Apagar o canal #${channel.name}?`)) return;
    try {
      await deleteChannel.mutateAsync(channel.id);
      await navigate(`/channels/${guild.id}`, { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível apagar o canal');
    }
  };

  return (
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
      <MessageList channel={channel} canModerate={isOwner} />
      <Composer channel={channel} />
    </main>
  );
}
