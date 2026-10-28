import {
  type ChannelDto,
  channelSchema,
  type CreateChannelData,
  type CreateGuildData,
  type GuildDto,
  guildSchema,
  type GuildWithChannelsDto,
  guildWithChannelsSchema,
  type MessageDto,
  type MessagePageDto,
  messagePageSchema,
  messageSchema,
} from '@discord-2/shared';
import { api } from './client';

export const MESSAGE_PAGE_SIZE = 50;

export function listGuilds(): Promise<GuildDto[]> {
  return api('/guilds', { schema: guildSchema.array() });
}

export function getGuild(guildId: string): Promise<GuildWithChannelsDto> {
  return api(`/guilds/${guildId}`, { schema: guildWithChannelsSchema });
}

export function createGuild(data: CreateGuildData): Promise<GuildWithChannelsDto> {
  return api('/guilds', { method: 'POST', body: data, schema: guildWithChannelsSchema });
}

export async function deleteGuild(guildId: string): Promise<void> {
  await api(`/guilds/${guildId}`, { method: 'DELETE' });
}

export function createChannel(guildId: string, data: CreateChannelData): Promise<ChannelDto> {
  return api(`/guilds/${guildId}/channels`, { method: 'POST', body: data, schema: channelSchema });
}

export async function deleteChannel(channelId: string): Promise<void> {
  await api(`/channels/${channelId}`, { method: 'DELETE' });
}

export function listMessages(channelId: string, before?: string): Promise<MessagePageDto> {
  const params = new URLSearchParams({ limit: String(MESSAGE_PAGE_SIZE) });
  if (before) params.set('before', before);
  return api(`/channels/${channelId}/messages?${params.toString()}`, { schema: messagePageSchema });
}

export function sendMessage(
  channelId: string,
  content: string,
  nonce: string,
): Promise<MessageDto> {
  return api(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: { content, nonce },
    schema: messageSchema,
  });
}

export function editMessage(messageId: string, content: string): Promise<MessageDto> {
  return api(`/messages/${messageId}`, {
    method: 'PATCH',
    body: { content },
    schema: messageSchema,
  });
}

export async function deleteMessage(messageId: string): Promise<void> {
  await api(`/messages/${messageId}`, { method: 'DELETE' });
}
