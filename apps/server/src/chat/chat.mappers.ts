import type { ChannelDto, GuildDto, GuildWithChannelsDto, MessageDto } from '@discord-2/shared';
import type { Channel, Guild, Message, User } from '../generated/prisma/client.js';

export function toGuildDto(guild: Guild): GuildDto {
  return {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId,
    createdAt: guild.createdAt.toISOString(),
  };
}

export function toGuildWithChannelsDto(
  guild: Guild & { channels: Channel[] },
): GuildWithChannelsDto {
  return { ...toGuildDto(guild), channels: guild.channels.map(toChannelDto) };
}

export function toChannelDto(channel: Channel): ChannelDto {
  return {
    id: channel.id,
    guildId: channel.guildId,
    name: channel.name,
    type: channel.type,
    position: channel.position,
    createdAt: channel.createdAt.toISOString(),
  };
}

/** Só os campos públicos do autor (nunca e-mail ou hash). */
export const messageAuthorSelect = { id: true, username: true, displayName: true } as const;

export type MessageWithAuthor = Message & {
  author: Pick<User, 'id' | 'username' | 'displayName'>;
};

export function toMessageDto(message: MessageWithAuthor, nonce?: string): MessageDto {
  return {
    id: message.id,
    channelId: message.channelId,
    author: message.author,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    ...(nonce && { nonce }),
  };
}
