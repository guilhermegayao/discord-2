import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DmChannelDto } from '@discord-2/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { publicUserSelect, toDmChannelDto } from './chat.mappers.js';

/** Chave única da conversa entre duas pessoas, independente de quem abriu. */
export function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}

const dmInclude = {
  participants: { include: { user: { select: publicUserSelect } } },
  messages: { orderBy: { id: 'desc' }, take: 1, select: { createdAt: true } },
} as const;

type DmRow = Prisma.ChannelGetPayload<{ include: typeof dmInclude }>;

@Injectable()
export class DmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Minhas conversas, da mais recente para a mais antiga. */
  async list(userId: string): Promise<DmChannelDto[]> {
    const rows = await this.prisma.channel.findMany({
      where: { type: 'DM', participants: { some: { userId } } },
      include: dmInclude,
    });
    return rows
      .map((row) => this.toDto(row, userId))
      .sort((a, b) =>
        (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
      );
  }

  /**
   * Abre a conversa com alguém (ou devolve a que já existe). Só é possível
   * com quem divide pelo menos um servidor com você: evita spam de estranhos.
   */
  async open(userId: string, targetId: string): Promise<DmChannelDto> {
    if (targetId === userId) {
      throw new BadRequestException('Você não pode abrir uma conversa consigo mesmo');
    }
    const sharesGuild = await this.prisma.member.findFirst({
      where: { userId: targetId, guild: { members: { some: { userId } } } },
      select: { guildId: true },
    });
    if (!sharesGuild) throw new NotFoundException('Usuário não encontrado');

    const dmKey = dmKeyFor(userId, targetId);
    const existing = await this.prisma.channel.findUnique({ where: { dmKey }, include: dmInclude });
    if (existing) return this.toDto(existing, userId);

    let created: DmRow;
    try {
      created = await this.prisma.channel.create({
        data: {
          type: 'DM',
          dmKey,
          participants: { create: [{ userId }, { userId: targetId }] },
        },
        include: dmInclude,
      });
    } catch (err) {
      // Os dois abriram a conversa ao mesmo tempo: o índice único segura, e usamos a que ganhou.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.channel.findUniqueOrThrow({
          where: { dmKey },
          include: dmInclude,
        });
        return this.toDto(winner, userId);
      }
      throw err;
    }

    // Cada um recebe a conversa do seu ponto de vista (o "recipient" é o outro).
    for (const p of created.participants) {
      this.realtime.emitToUser(p.userId, 'dm:created', this.toDto(created, p.userId));
    }
    return this.toDto(created, userId);
  }

  private toDto(row: DmRow, viewerId: string): DmChannelDto {
    const other = row.participants.find((p) => p.userId !== viewerId);
    if (!other) throw new Error(`DM ${row.id} sem o outro participante`);
    return toDmChannelDto(row, other.user, this.realtime.isOnline(other.userId), row.messages[0]);
  }
}
