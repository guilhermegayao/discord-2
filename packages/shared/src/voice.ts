import { z } from 'zod';
import { publicUserSchema } from './chat.js';

/** Credencial para entrar na sala do LiveKit de um canal de voz. */
export const voiceTokenSchema = z.object({
  /** Endereço do LiveKit (ws:// em dev, wss:// em produção). */
  url: z.string(),
  /** JWT assinado pelo nosso servidor, válido por poucos minutos. */
  token: z.string(),
});
export type VoiceTokenDto = z.infer<typeof voiceTokenSchema>;

/** Quem está conectado em um canal de voz agora. */
export const voiceChannelStateSchema = z.object({
  channelId: z.string(),
  participants: z.array(publicUserSchema),
});
export type VoiceChannelStateDto = z.infer<typeof voiceChannelStateSchema>;

export interface VoiceStateEvent extends VoiceChannelStateDto {
  guildId: string;
}
