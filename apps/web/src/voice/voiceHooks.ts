import { useQuery } from '@tanstack/react-query';
import { listVoiceStates } from '../api/voice';
import { queryKeys } from '../chat/cache';

/** Quem está em cada canal de voz do servidor (atualizado pelo evento voice:state). */
export function useVoiceStates(guildId: string) {
  return useQuery({
    queryKey: queryKeys.voiceStates(guildId),
    queryFn: () => listVoiceStates(guildId),
  });
}
