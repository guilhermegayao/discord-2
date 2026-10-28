import { ConflictException, Injectable } from '@nestjs/common';
import type { ChannelDto, CreateChannelData, UpdateChannelData } from '@discord-2/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ChatAccessService } from '../access/chat-access.service.js';
import { toChannelDto } from './chat.mappers.js';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(guildId: string, userId: string, data: CreateChannelData): Promise<ChannelDto> {
    await this.access.requireOwner(guildId, userId);

    const last = await this.prisma.channel.aggregate({
      where: { guildId },
      _max: { position: true },
    });
    const channel = await this.prisma.channel.create({
      data: {
        guildId,
        name: data.name,
        type: data.type,
        position: (last._max.position ?? -1) + 1,
      },
    });

    const dto = toChannelDto(channel);
    this.realtime.emitToGuild(guildId, 'channel:created', dto);
    return dto;
  }

  async update(channelId: string, userId: string, data: UpdateChannelData): Promise<ChannelDto> {
    const { channel } = await this.access.requireGuildChannel(channelId, userId);
    await this.access.requireOwner(channel.guildId, userId);

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: { name: data.name },
    });

    const dto = toChannelDto(updated);
    this.realtime.emitToGuild(channel.guildId, 'channel:updated', dto);
    return dto;
  }

  async remove(channelId: string, userId: string): Promise<void> {
    const { channel } = await this.access.requireGuildChannel(channelId, userId);
    await this.access.requireOwner(channel.guildId, userId);

    // Todo servidor mantém pelo menos um canal de texto: a interface sempre tem para onde ir.
    if (channel.type === 'TEXT') {
      const textChannels = await this.prisma.channel.count({
        where: { guildId: channel.guildId, type: 'TEXT' },
      });
      if (textChannels <= 1) {
        throw new ConflictException('O servidor precisa ter pelo menos um canal de texto');
      }
    }

    await this.prisma.channel.delete({ where: { id: channelId } });
    this.realtime.emitToGuild(channel.guildId, 'channel:deleted', {
      id: channelId,
      guildId: channel.guildId,
    });
  }
}
