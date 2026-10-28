import {
  type VoiceChannelStateDto,
  voiceChannelStateSchema,
  type VoiceTokenDto,
  voiceTokenSchema,
} from '@discord-2/shared';
import { api } from './client';

export function getVoiceToken(channelId: string): Promise<VoiceTokenDto> {
  return api(`/channels/${channelId}/voice-token`, { method: 'POST', schema: voiceTokenSchema });
}

export function listVoiceStates(guildId: string): Promise<VoiceChannelStateDto[]> {
  return api(`/guilds/${guildId}/voice-states`, { schema: voiceChannelStateSchema.array() });
}
