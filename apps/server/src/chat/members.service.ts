import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { MemberDto } from '@discord-2/shared';
import { ChatAccessService } from '../access/chat-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { publicUserSelect, toMemberDto } from './chat.mappers.js';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Membros com o status online/offline de agora. */
  async list(guildId: string, userId: string): Promise<MemberDto[]> {
    await this.access.requireMember(guildId, userId);
    const members = await this.prisma.member.findMany({
      where: { guildId },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      include: { user: { select: publicUserSelect } },
    });
    return members.map((m) => toMemberDto(m, this.realtime.isOnline(m.userId)));
  }

  async leave(guildId: string, userId: string): Promise<void> {
    const role = await this.access.requireMember(guildId, userId);
    if (role === 'OWNER') {
      // Sem isso o servidor ficaria sem dono. (Transferir a posse fica para depois.)
      throw new ConflictException('O dono não pode sair do servidor; apague-o se quiser encerrar');
    }
    await this.remove(guildId, userId);
  }

  async kick(guildId: string, ownerId: string, targetId: string): Promise<void> {
    await this.access.requireOwner(guildId, ownerId);
    if (targetId === ownerId) throw new ConflictException('Você não pode expulsar a si mesmo');

    const target = await this.prisma.member.findUnique({
      where: { guildId_userId: { guildId, userId: targetId } },
    });
    if (!target) throw new NotFoundException('Membro não encontrado');
    await this.remove(guildId, targetId);
  }

  /**
   * Tira do banco e também do tempo real: os sockets abertos da pessoa saem
   * da sala na hora. Sem isso, ela continuaria recebendo as mensagens.
   */
  private async remove(guildId: string, userId: string): Promise<void> {
    await this.prisma.member.delete({ where: { guildId_userId: { guildId, userId } } });

    this.realtime.removeUserFromGuild(userId, guildId);
    this.realtime.emitToUser(userId, 'guild:removed', { id: guildId });
    this.realtime.emitToGuild(guildId, 'member:left', { guildId, userId });
  }
}
