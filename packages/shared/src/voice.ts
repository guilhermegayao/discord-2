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

/** Alguém num canal de voz. */
export const voiceParticipantSchema = publicUserSchema.extend({
  /** Está compartilhando a tela agora (o 🔴 AO VIVO). */
  streaming: z.boolean(),
});
export type VoiceParticipantDto = z.infer<typeof voiceParticipantSchema>;

/** Quem está conectado em um canal de voz agora. */
export const voiceChannelStateSchema = z.object({
  channelId: z.string(),
  participants: z.array(voiceParticipantSchema),
});
export type VoiceChannelStateDto = z.infer<typeof voiceChannelStateSchema>;

export interface VoiceStateEvent extends VoiceChannelStateDto {
  guildId: string;
}
