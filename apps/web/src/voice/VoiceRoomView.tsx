import { useRef } from 'react';
import { Navigate, useParams } from 'react-router';
import { initials } from '../chat/format';
import { useGuildContext } from '../chat/guildContext';
import { TrackVideo } from './TrackVideo';
import { type LiveParticipant, useVoice } from './VoiceContext';
import { useVoiceStates } from './voiceHooks';

/**
 * /channels/:guildId/voice/:channelId — o "palco" do canal de voz: quem está
 * lá, quem está transmitindo e a tela que eu escolhi assistir.
 */
export function VoiceRoomView() {
  const { channelId } = useParams();
  const { guild } = useGuildContext();
  const voice = useVoice();
  const states = useVoiceStates(guild.id).data ?? [];
  const channel = guild.channels.find((c) => c.id === channelId && c.type === 'VOICE');

  if (!channel) return <Navigate to={`/channels/${guild.id}`} replace />;

  const here = voice.channel?.id === channel.id && voice.status === 'connected';
  const outsideList = states.find((s) => s.channelId === channel.id)?.participants ?? [];

  return (
    <main className="chat voice-room">
      <header className="chat__header">
        <h1>
          <span aria-hidden="true">🔊</span> {channel.name}
        </h1>
      </header>

      {!here ? (
        <div className="voice-room__outside">
          <p className="muted">
            {outsideList.length === 0
              ? 'Ninguém na voz agora.'
              : `${outsideList.length} na voz: ${outsideList.map((p) => p.displayName).join(', ')}`}
          </p>
          <button
            type="button"
            disabled={voice.status === 'connecting'}
            onClick={() =>
              void voice.join({ id: channel.id, name: channel.name, guildId: guild.id })
            }
          >
            {voice.status === 'connecting' && voice.channel?.id === channel.id
              ? 'Conectando…'
              : 'Entrar na voz'}
          </button>
        </div>
      ) : (
        <div className="voice-room__body">
          {voice.watching && <Stage />}
          <ul className="voice-room__grid" aria-label="Participantes">
            {voice.participants.map((p) => (
              <ParticipantCard key={p.id} participant={p} />
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

/** A tela que estou assistindo, grande, com tela cheia. */
function Stage() {
  const voice = useVoice();
  const stageRef = useRef<HTMLDivElement>(null);
  const streamer = voice.participants.find((p) => p.id === voice.watching);

  return (
    <section className="stage" ref={stageRef} aria-label={`Tela de ${streamer?.name ?? 'alguém'}`}>
      {voice.watchedTrack ? (
        <TrackVideo
          track={voice.watchedTrack}
          className="stage__video"
          label={`Transmissão de ${streamer?.name ?? 'alguém'}`}
        />
      ) : (
        <p className="stage__loading muted">Carregando a transmissão…</p>
      )}
      <div className="stage__controls">
        <span className="live-badge">🔴 AO VIVO</span>
        <span>{streamer?.name}</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Tela cheia"
          title="Tela cheia"
          onClick={() => void stageRef.current?.requestFullscreen?.()}
        >
          ⛶
        </button>
        <button type="button" className="button--secondary" onClick={voice.stopWatching}>
          Parar de assistir
        </button>
      </div>
    </section>
  );
}

function ParticipantCard({ participant: p }: { participant: LiveParticipant }) {
  const voice = useVoice();
  const isWatching = voice.watching === p.id;

  return (
    <li className={`voice-card${p.speaking ? ' voice-card--speaking' : ''}`}>
      {p.isLocal && voice.sharing && voice.localScreenTrack ? (
        <TrackVideo
          track={voice.localScreenTrack}
          className="voice-card__preview"
          label="Sua transmissão"
        />
      ) : (
        <span className="avatar voice-card__avatar" aria-hidden="true">
          {initials(p.name)}
        </span>
      )}
      <span className="voice-card__name">
        {p.name}
        {p.isLocal && ' (você)'}
        {p.muted && (
          <span role="img" aria-label="microfone desligado">
            {' '}
            🔇
          </span>
        )}
      </span>
      {p.speaking && <span className="sr-only">(falando)</span>}
      {p.streaming && <span className="live-badge">🔴 AO VIVO</span>}
      {p.streaming && !p.isLocal && (
        <button
          type="button"
          className={isWatching ? 'button--secondary' : ''}
          aria-label={isWatching ? `Parar de assistir ${p.name}` : `Assistir ${p.name}`}
          onClick={() => (isWatching ? voice.stopWatching() : voice.watch(p.id))}
        >
          {isWatching ? 'Assistindo' : 'Assistir'}
        </button>
      )}
    </li>
  );
}
