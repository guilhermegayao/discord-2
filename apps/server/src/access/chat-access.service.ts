import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Channel, MemberRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type GuildChannel = Channel & { guildId: string };

/** Quem pode ver um canal e com qual papel. */
export type ChannelAccess =
  | { kind: 'guild'; channel: GuildChannel; role: MemberRole }
  | { kind: 'dm'; channel: Channel; participantIds: string[] };

/**
 * Regras de acesso do chat, num lugar só.
 *
 * Quem não tem acesso recebe 404 (não 403): assim a API não confirma que
 * aquele servidor/canal/mensagem existe para quem está de fora.
 */
@Injectable()
export class ChatAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMember(guildId: string, userId: string): Promise<MemberRole> {
    const member = await this.prisma.member.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { role: true },
    });
    if (!member) throw new NotFoundException('Servidor não encontrado');
    return member.role;
  }

  async requireOwner(guildId: string, userId: string): Promise<void> {
    const role = await this.requireMember(guildId, userId);
    if (role !== 'OWNER') throw new ForbiddenException('Só o dono do servidor pode fazer isso');
  }

  /** Canal de servidor ou DM: membros do servidor, ou os dois participantes da DM. */
  async requireChannel(channelId: string, userId: string): Promise<ChannelAccess> {
    const row = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        guild: { select: { members: { where: { userId }, select: { role: true } } } },
        participants: { select: { userId: true } },
      },
    });
    if (!row) throw new NotFoundException('Canal não encontrado');

    const { guild, participants, ...channel } = row;

    if (channel.type === 'DM') {
      const participantIds = participants.map((p) => p.userId);
      if (!participantIds.includes(userId)) throw new NotFoundException('Canal não encontrado');
      return { kind: 'dm', channel, participantIds };
    }

    const role = guild?.members[0]?.role;
    if (!channel.guildId || !role) throw new NotFoundException('Canal não encontrado');
    return { kind: 'guild', channel: { ...channel, guildId: channel.guildId }, role };
  }

  /** Só canais de servidor (renomear/apagar canal não se aplica a DMs). */
  async requireGuildChannel(
    channelId: string,
    userId: string,
  ): Promise<{ channel: GuildChannel; role: MemberRole }> {
    const access = await this.requireChannel(channelId, userId);
    if (access.kind !== 'guild') throw new NotFoundException('Canal não encontrado');
    return access;
  }

  /** Quem deve receber eventos de um canal: a sala do servidor ou os participantes da DM. */
  static audience(access: ChannelAccess): { guildId: string } | { userIds: string[] } {
    return access.kind === 'guild'
      ? { guildId: access.channel.guildId }
      : { userIds: access.participantIds };
  }
}
