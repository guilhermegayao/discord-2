import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Channel, MemberRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Regras de acesso do chat, num lugar só.
 *
 * Quem não é membro recebe 404 (não 403): assim a API não confirma que
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

  async requireChannel(
    channelId: string,
    userId: string,
  ): Promise<{ channel: Channel; role: MemberRole }> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { guild: { select: { members: { where: { userId }, select: { role: true } } } } },
    });
    const role = channel?.guild.members[0]?.role;
    if (!channel || !role) throw new NotFoundException('Canal não encontrado');

    const { guild, ...rest } = channel;
    return { channel: rest, role };
  }
}
