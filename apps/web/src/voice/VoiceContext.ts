import { createContext, useContext } from 'react';

export interface VoiceChannelRef {
  id: string;
  name: string;
  guildId: string;
}

/** Como cada pessoa aparece na lista de quem está no canal em que eu estou. */
export interface LiveParticipant {
  id: string;
  name: string;
  speaking: boolean;
  muted: boolean;
  isLocal: boolean;
}

export type VoiceStatus = 'idle' | 'connecting' | 'connected';

export interface VoiceContextValue {
  status: VoiceStatus;
  channel: VoiceChannelRef | null;
  /** Mensagem para mostrar (permissão negada, entrou em outra aba...). */
  error: string | null;
  micEnabled: boolean;
  deafened: boolean;
  /** Quem está no canal em que eu estou, ao vivo (com quem está falando). */
  participants: LiveParticipant[];
  join: (channel: VoiceChannelRef) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  switchDevice: (kind: 'audioinput' | 'audiooutput', deviceId: string) => Promise<void>;
  dismissError: () => void;
}

export const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice precisa estar dentro de <VoiceProvider>');
  return ctx;
}
