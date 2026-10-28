import {
  type DmChannelDto,
  dmChannelSchema,
  type GuildWithChannelsDto,
  guildWithChannelsSchema,
  type InviteDto,
  type InviteExpiration,
  type InvitePreviewDto,
  invitePreviewSchema,
  inviteSchema,
  type MemberDto,
  memberSchema,
} from '@discord-2/shared';
import { api } from './client';

export function createInvite(guildId: string, expiresIn: InviteExpiration): Promise<InviteDto> {
  return api(`/guilds/${guildId}/invites`, {
    method: 'POST',
    body: { expiresIn },
    schema: inviteSchema,
  });
}

export function previewInvite(code: string): Promise<InvitePreviewDto> {
  return api(`/invites/${encodeURIComponent(code)}`, { schema: invitePreviewSchema });
}

export function acceptInvite(code: string): Promise<GuildWithChannelsDto> {
  return api(`/invites/${encodeURIComponent(code)}`, {
    method: 'POST',
    schema: guildWithChannelsSchema,
  });
}

export function listMembers(guildId: string): Promise<MemberDto[]> {
  return api(`/guilds/${guildId}/members`, { schema: memberSchema.array() });
}

export async function leaveGuild(guildId: string): Promise<void> {
  await api(`/guilds/${guildId}/leave`, { method: 'POST' });
}

export async function kickMember(guildId: string, userId: string): Promise<void> {
  await api(`/guilds/${guildId}/members/${userId}`, { method: 'DELETE' });
}

export function listDms(): Promise<DmChannelDto[]> {
  return api('/dms', { schema: dmChannelSchema.array() });
}

export function openDm(userId: string): Promise<DmChannelDto> {
  return api('/dms', { method: 'POST', body: { userId }, schema: dmChannelSchema });
}
