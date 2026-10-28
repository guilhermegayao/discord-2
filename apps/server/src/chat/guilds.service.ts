import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateGuildData,
  GuildDto,
  GuildWithChannelsDto,
  UpdateGuildData,
} from '@discord-2/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ChatAccessService } from '../access/chat-access.service.js';
import { VoiceService } from '../voice/voice.service.js';
import { toGuildDto, toGuildWithChannelsDto } from './chat.mappers.js';

const channelsInOrder = { channels: { orderBy: { position: 'asc' } } } as const;

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly realtime: RealtimeGateway,
    private readonly voice: VoiceService,
  ) {}

  /** Servidores de que o usuário participa, na ordem em que entrou. */
  async listForUser(userId: string): Promise<GuildDto[]> {
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      // joinedAt tem precisão de milissegundo: dois servidores no mesmo ms
      // empatariam e a ordem viraria aleatória. O id (UUID v7) desempata.
      orderBy: [{ joinedAt: 'asc' }, { guildId: 'asc' }],
      include: { guild: true },
    });
    return memberships.map((m) => toGuildDto(m.guild));
  }

  /**
   * Cria o servidor, o membro dono e o canal #geral numa única operação:
   * o Prisma faz os inserts aninhados dentro de uma transação, então ou
   * nasce tudo ou nada.
   */
  async create(userId: string, data: CreateGuildData): Promise<GuildWithChannelsDto> {
    const guild = await this.prisma.guild.create({
      data: {
        name: data.name,
        ownerId: userId,
        members: { create: { userId, role: 'OWNER' } },
        channels: { create: { name: 'geral', position: 0 } },
      },
      include: channelsInOrder,
    });

    const dto = toGuildWithChannelsDto(guild);
    // As outras abas/dispositivos do usuário passam a ouvir o servidor novo.
    this.realtime.addUserToGuild(userId, guild.id);
    this.realtime.emitToUser(userId, 'guild:created', dto);
    return dto;
  }

  async get(guildId: string, userId: string): Promise<GuildWithChannelsDto> {
    await this.access.requireMember(guildId, userId);
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: channelsInOrder,
    });
    if (!guild) throw new NotFoundException('Servidor não encontrado');
    return toGuildWithChannelsDto(guild);
  }

  async update(guildId: string, userId: string, data: UpdateGuildData): Promise<GuildDto> {
    await this.access.requireOwner(guildId, userId);
    const guild = await this.prisma.guild.update({
      where: { id: guildId },
      data: { name: data.name },
    });

    const dto = toGuildDto(guild);
    this.realtime.emitToGuild(guildId, 'guild:updated', dto);
    return dto;
  }

  async remove(guildId: string, userId: string): Promise<void> {
    await this.access.requireOwner(guildId, userId);
    const voiceChannels = await this.prisma.channel.findMany({
      where: { guildId, type: 'VOICE' },
      select: { id: true },
    });
    // Canais, membros e mensagens vão junto (ON DELETE CASCADE).
    await this.prisma.guild.delete({ where: { id: guildId } });

    this.realtime.emitToGuild(guildId, 'guild:deleted', { id: guildId });
    this.realtime.closeGuild(guildId);
    for (const { id } of voiceChannels) await this.voice.closeChannel(id);
  }
}
