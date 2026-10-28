import type { ChannelDto, GuildWithChannelsDto, PublicUserDto } from '@discord-2/shared';
import { initials } from '../chat/format';
import { useDeleteChannel } from '../chat/hooks';
import { type LiveParticipant, useVoice } from './VoiceContext';
import { useVoiceStates } from './voiceHooks';

interface Props {
  guild: GuildWithChannelsDto;
  isOwner: boolean;
}

/** Seção "Canais de voz": clicar entra; embaixo de cada canal, quem está nele. */
export function VoiceChannelList({ guild, isOwner }: Props) {
  const voiceChannels = guild.channels.filter((c) => c.type === 'VOICE');
  const states = useVoiceStates(guild.id).data ?? [];

  if (voiceChannels.length === 0) return null;

  return (
    <nav aria-label="Canais de voz">
      <ul>
        {voiceChannels.map((channel) => (
          <VoiceChannelItem
            key={channel.id}
            channel={channel}
            guildId={guild.id}
            isOwner={isOwner}
            people={states.find((s) => s.channelId === channel.id)?.participants ?? []}
          />
        ))}
      </ul>
    </nav>
  );
}

function VoiceChannelItem({
  channel,
  guildId,
  isOwner,
  people,
}: {
  channel: ChannelDto;
  guildId: string;
  isOwner: boolean;
  people: PublicUserDto[];
}) {
  const voice = useVoice();
  const deleteChannel = useDeleteChannel(guildId);
  const isHere = voice.channel?.id === channel.id && voice.status !== 'idle';

  // No canal em que estou, a lista vem ao vivo do LiveKit (com quem está falando);
  // nos outros, vem do servidor (só quem está lá).
  const list: LiveParticipant[] =
    isHere && voice.status === 'connected'
      ? voice.participants
      : people.map((p) => ({
          id: p.id,
          name: p.displayName,
          speaking: false,
          muted: false,
          isLocal: false,
        }));

  return (
    <li className="voice-channel">
      <div className="voice-channel__row">
        <button
          type="button"
          className={`channel-link voice-channel__join${isHere ? ' active' : ''}`}
          aria-label={`Entrar no canal de voz ${channel.name}`}
          aria-current={isHere ? 'true' : undefined}
          onClick={() => void voice.join({ id: channel.id, name: channel.name, guildId })}
        >
          <span aria-hidden="true">🔊</span> {channel.name}
        </button>
        {isOwner && (
          <button
            type="button"
            className="icon-button voice-channel__delete"
            aria-label={`Apagar canal de voz ${channel.name}`}
            onClick={() => {
              if (window.confirm(`Apagar o canal de voz ${channel.name}?`)) {
                deleteChannel.mutate(channel.id);
              }
            }}
          >
            🗑
          </button>
        )}
      </div>
      {list.length > 0 && (
        <ul className="voice-channel__people" aria-label={`Na voz em ${channel.name}`}>
          {list.map((p) => (
            <li key={p.id} className="voice-person">
              <span
                className={`avatar avatar--tiny${p.speaking ? ' avatar--speaking' : ''}`}
                aria-hidden="true"
              >
                {initials(p.name)}
              </span>
              <span className="voice-person__name">{p.name}</span>
              {p.speaking && <span className="sr-only">(falando)</span>}
              {p.muted && (
                <span className="voice-person__muted" role="img" aria-label="microfone desligado">
                  🔇
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
