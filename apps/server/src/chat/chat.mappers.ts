import type {
  ChannelDto,
  DmChannelDto,
  GuildDto,
  GuildWithChannelsDto,
  InviteDto,
  MemberDto,
  MessageDto,
  PublicUserDto,
} from '@discord-2/shared';
import type { Channel, Guild, Invite, Member, Message, User } from '../generated/prisma/client.js';

/** Só os campos públicos de um usuário (nunca e-mail ou hash). */
export const publicUserSelect = { id: true, username: true, displayName: true } as const;
export const messageAuthorSelect = publicUserSelect;

type PublicUser = Pick<User, 'id' | 'username' | 'displayName'>;

export function toPublicUser(user: PublicUser): PublicUserDto {
  return { id: user.id, username: user.username, displayName: user.displayName };
}

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

/** Canal de servidor. DMs têm o próprio formato (toDmChannelDto). */
export function toChannelDto(channel: Channel): ChannelDto {
  if (channel.type !== 'TEXT' || !channel.guildId) {
    throw new Error(`Canal ${channel.id} não é um canal de servidor`);
  }
  return {
    id: channel.id,
    guildId: channel.guildId,
    name: channel.name,
    type: channel.type,
    position: channel.position,
    createdAt: channel.createdAt.toISOString(),
  };
}

export function toDmChannelDto(
  channel: Channel,
  recipient: PublicUser,
  recipientOnline: boolean,
  lastMessage: Pick<Message, 'createdAt'> | undefined,
): DmChannelDto {
  return {
    id: channel.id,
    type: 'DM',
    recipient: toPublicUser(recipient),
    recipientOnline,
    createdAt: channel.createdAt.toISOString(),
    lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
  };
}

export type MessageWithAuthor = Message & { author: PublicUser };

export function toMessageDto(message: MessageWithAuthor, nonce?: string): MessageDto {
  return {
    id: message.id,
    channelId: message.channelId,
    author: toPublicUser(message.author),
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    ...(nonce && { nonce }),
  };
}

export function toMemberDto(member: Member & { user: PublicUser }, online: boolean): MemberDto {
  return {
    user: toPublicUser(member.user),
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    online,
  };
}

export function toInviteDto(invite: Invite & { creator: PublicUser }): InviteDto {
  return {
    code: invite.code,
    guildId: invite.guildId,
    creator: toPublicUser(invite.creator),
    uses: invite.uses,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}
