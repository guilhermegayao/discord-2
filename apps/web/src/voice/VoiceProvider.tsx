import {
  DisconnectReason,
  type LocalTrackPublication,
  type Participant,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import * as voiceApi from '../api/voice';
import { createRoom } from './livekit';
import { canShareScreen, SHARE_PRESETS, type SharePreset } from './screenShare';
import {
  type LiveParticipant,
  type VoiceChannelRef,
  VoiceContext,
  type VoiceContextValue,
  type VoiceStatus,
} from './VoiceContext';

const DISCONNECT_MESSAGES: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.DUPLICATE_IDENTITY]: 'Você entrou na voz em outra aba ou dispositivo.',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'Você foi removido do canal de voz.',
  [DisconnectReason.ROOM_DELETED]: 'O canal de voz foi encerrado.',
};

const SCREEN_SOURCES: Track.Source[] = [Track.Source.ScreenShare, Track.Source.ScreenShareAudio];

function micErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError') {
    return 'O navegador bloqueou o microfone. Permita o acesso (ícone de cadeado na barra de endereço) e tente de novo.';
  }
  if (name === 'NotFoundError') return 'Nenhum microfone encontrado.';
  return 'Não foi possível usar o microfone.';
}

function setVolume(track: unknown, volume: number): void {
  const audio = track as Partial<RemoteAudioTrack> | undefined;
  audio?.setVolume?.(volume);
}

/** Volume de todo mundo que eu ouço (0 = ensurdecido). */
function setRemoteVolume(room: Room, volume: number): void {
  room.remoteParticipants.forEach((p) =>
    p.audioTrackPublications.forEach((pub) => setVolume(pub.track, volume)),
  );
}

/**
 * O que eu recebo de cada pessoa. Conectamos com autoSubscribe desligado e
 * decidimos aqui: o microfone de todo mundo, sempre; a tela (e o áudio dela)
 * só de quem eu escolhi assistir. Cada tela não assistida é banda economizada.
 */
function wantsTrack(pub: RemoteTrackPublication, owner: Participant, watching: string | null) {
  if (pub.source === Track.Source.Microphone) return true;
  if (SCREEN_SOURCES.includes(pub.source)) return owner.identity === watching;
  return false;
}

function applySubscriptions(room: Room, watching: string | null): void {
  room.remoteParticipants.forEach((p) =>
    p.trackPublications.forEach((pub) => pub.setSubscribed(wantsTrack(pub, p, watching))),
  );
}

type Person = Omit<LiveParticipant, 'speaking'>;

/** Foto de quem está na sala agora (lida só em eventos, nunca durante o render). */
function snapshot(room: Room): Person[] {
  const toPerson = (p: Participant, isLocal: boolean): Person => ({
    id: p.identity,
    name: p.name || p.identity,
    muted: !p.isMicrophoneEnabled,
    streaming: p.isScreenShareEnabled,
    isLocal,
  });
  return [
    toPerson(room.localParticipant, true),
    ...[...room.remoteParticipants.values()].map((p) => toPerson(p, false)),
  ];
}

/**
 * Mantém a conexão de voz viva enquanto a pessoa navega pelo app (como no
 * Discord: dá para ler outro canal de texto sem cair da voz). Fica dentro da
 * área logada; ao sair da conta, desconecta.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const roomRef = useRef<Room | null>(null);
  const audioContainer = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [channel, setChannel] = useState<VoiceChannelRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [localScreenTrack, setLocalScreenTrack] = useState<Track | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [watchedTrack, setWatchedTrack] = useState<Track | null>(null);
  const deafenedRef = useRef(false);
  const watchingRef = useRef<string | null>(null);
  /** Estado do microfone antes de ensurdecer, para restaurar depois. */
  const micBeforeDeafen = useRef(true);

  const reset = useCallback(() => {
    roomRef.current = null;
    setStatus('idle');
    setChannel(null);
    setMicEnabled(false);
    setDeafened(false);
    deafenedRef.current = false;
    setPeople([]);
    setSpeaking(new Set());
    setSharing(false);
    setLocalScreenTrack(null);
    setWatching(null);
    watchingRef.current = null;
    setWatchedTrack(null);
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    reset();
    // Saiu porque quis: avisos da sessão anterior (ex.: microfone) não valem mais.
    setError(null);
    await room?.disconnect();
  }, [reset]);

  const join = useCallback(
    async (target: VoiceChannelRef) => {
      if (roomRef.current && channel?.id === target.id) return;
      if (roomRef.current) await leave();

      setError(null);
      setStatus('connecting');
      setChannel(target);

      let room: Room | null = null;
      try {
        const { url, token } = await voiceApi.getVoiceToken(target.id);
        const current = createRoom();
        room = current;
        roomRef.current = current;
        const refresh = () => setPeople(snapshot(current));

        current
          .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) =>
            setSpeaking(new Set(speakers.map((s) => s.identity))),
          )
          .on(RoomEvent.ParticipantConnected, refresh)
          .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
            if (p.identity === watchingRef.current) {
              watchingRef.current = null;
              setWatching(null);
              setWatchedTrack(null);
            }
            refresh();
          })
          .on(RoomEvent.TrackMuted, refresh)
          .on(RoomEvent.TrackUnmuted, refresh)
          // Alguém começou a transmitir algo: decidimos se recebemos.
          .on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => {
            pub.setSubscribed(wantsTrack(pub, p, watchingRef.current));
            refresh();
          })
          .on(RoomEvent.TrackUnpublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => {
            // A pessoa que eu assistia parou de transmitir.
            if (pub.source === Track.Source.ScreenShare && p.identity === watchingRef.current) {
              watchingRef.current = null;
              setWatching(null);
              setWatchedTrack(null);
            }
            refresh();
          })
          .on(
            RoomEvent.TrackSubscribed,
            (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
              if (track.kind === Track.Kind.Audio) {
                // Voz e áudio da tela tocam pelo mesmo caminho (e respeitam o ensurdecer).
                audioContainer.current?.appendChild(track.attach());
                setVolume(track, deafenedRef.current ? 0 : 1);
              } else if (
                pub.source === Track.Source.ScreenShare &&
                p.identity === watchingRef.current
              ) {
                setWatchedTrack(track);
              }
              refresh();
            },
          )
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            track.detach().forEach((el) => el.remove());
            setWatchedTrack((current) => (current === track ? null : current));
            refresh();
          })
          // Minha tela: começou/parou (inclusive pelo botão "Parar" do próprio navegador).
          .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
            if (pub.source === Track.Source.ScreenShare) {
              setSharing(true);
              setLocalScreenTrack(pub.track ?? null);
            }
            refresh();
          })
          .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
            if (pub.source === Track.Source.ScreenShare) {
              setSharing(false);
              setLocalScreenTrack(null);
            }
            refresh();
          })
          .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
            // Saída pedida por nós já foi tratada em leave(); aqui são as outras.
            if (roomRef.current !== current) return;
            reset();
            const message = reason !== undefined ? DISCONNECT_MESSAGES[reason] : undefined;
            if (message) setError(message);
          });

        await current.connect(url, token, { autoSubscribe: false });
        // Quem já estava na sala antes de eu chegar.
        applySubscriptions(current, watchingRef.current);
        try {
          await current.localParticipant.setMicrophoneEnabled(true);
          setMicEnabled(true);
        } catch (micError) {
          // Sem microfone dá para ouvir, mas avisamos o motivo.
          setError(micErrorMessage(micError));
          setMicEnabled(false);
        }
        setStatus('connected');
        refresh();
      } catch {
        if (roomRef.current === room) {
          reset();
          await room?.disconnect();
        }
        setError('Não foi possível entrar no canal de voz. O servidor de voz está rodando?');
      }
    },
    [channel?.id, leave, reset],
  );

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicEnabled(next);
      // Desmutar enquanto ensurdecido tira o ensurdecer (igual ao Discord).
      if (next && deafenedRef.current) {
        deafenedRef.current = false;
        setDeafened(false);
        setRemoteVolume(room, 1);
      }
    } catch (err) {
      setError(micErrorMessage(err));
    }
    setPeople(snapshot(room));
  }, []);

  /** Ensurdecer = não ouvir ninguém e também mutar o microfone. */
  const toggleDeafen = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    setRemoteVolume(room, next ? 0 : 1);
    if (next) {
      micBeforeDeafen.current = room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(false);
      setMicEnabled(false);
    } else if (micBeforeDeafen.current) {
      await room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
      setMicEnabled(room.localParticipant.isMicrophoneEnabled);
    }
    setPeople(snapshot(room));
  }, []);

  const switchDevice = useCallback(async (kind: 'audioinput' | 'audiooutput', deviceId: string) => {
    await roomRef.current?.switchActiveDevice(kind, deviceId);
  }, []);

  const startShare = useCallback(async (preset: SharePreset) => {
    const room = roomRef.current;
    if (!room) return;
    if (!canShareScreen()) {
      setError('Este navegador não permite compartilhar a tela.');
      return;
    }
    const { capture, publish } = SHARE_PRESETS[preset];
    try {
      setError(null);
      await room.localParticipant.setScreenShareEnabled(true, capture, publish);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      // Fechar o seletor do navegador sem escolher nada não é erro.
      if (name === 'NotAllowedError' || name === 'AbortError') return;
      setError('Não foi possível compartilhar a tela.');
    }
  }, []);

  const stopShare = useCallback(async () => {
    await roomRef.current?.localParticipant.setScreenShareEnabled(false);
  }, []);

  /** Começa a receber a tela (e o áudio dela) de alguém; só uma por vez. */
  const watch = useCallback((participantId: string) => {
    const room = roomRef.current;
    if (!room) return;
    watchingRef.current = participantId;
    setWatching(participantId);
    setWatchedTrack(null);
    applySubscriptions(room, participantId);
  }, []);

  const stopWatching = useCallback(() => {
    const room = roomRef.current;
    watchingRef.current = null;
    setWatching(null);
    setWatchedTrack(null);
    if (room) applySubscriptions(room, null);
  }, []);

  // Saiu da área logada (logout): desconecta.
  useEffect(
    () => () => {
      void roomRef.current?.disconnect();
    },
    [],
  );

  const value: VoiceContextValue = {
    status,
    channel,
    error,
    micEnabled,
    deafened,
    participants:
      status === 'connected' ? people.map((p) => ({ ...p, speaking: speaking.has(p.id) })) : [],
    join,
    leave,
    toggleMic,
    toggleDeafen,
    switchDevice,
    dismissError: () => setError(null),
    sharing,
    localScreenTrack,
    startShare,
    stopShare,
    watching,
    watchedTrack,
    watch,
    stopWatching,
  };

  return (
    <VoiceContext value={value}>
      {children}
      {/* Os <audio> das outras pessoas ficam aqui, fora da tela. */}
      <div ref={audioContainer} hidden aria-hidden="true" />
    </VoiceContext>
  );
}
