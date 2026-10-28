import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateMessageData,
  MessageDto,
  MessagePageDto,
  MessagePageQuery,
  UpdateMessageData,
} from '@discord-2/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ChatAccessService } from './chat-access.service.js';
import { messageAuthorSelect, toMessageDto } from './chat.mappers.js';

const withAuthor = { author: { select: messageAuthorSelect } } as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Paginação por cursor: "as N mensagens mais novas com id < before".
   * Como o id é UUID v7 (ordenado por tempo), ele mesmo serve de cursor,
   * e o índice (channel_id, id DESC) atende a consulta sem varrer o canal.
   * Buscamos N+1 para saber se ainda há mais páginas sem um COUNT extra.
   */
  async list(channelId: string, userId: string, query: MessagePageQuery): Promise<MessagePageDto> {
    await this.access.requireChannel(channelId, userId);

    const rows = await this.prisma.message.findMany({
      where: { channelId, ...(query.before && { id: { lt: query.before } }) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: withAuthor,
    });

    const hasMore = rows.length > query.limit;
    return {
      messages: rows.slice(0, query.limit).map((m) => toMessageDto(m)),
      hasMore,
    };
  }

  async create(channelId: string, userId: string, data: CreateMessageData): Promise<MessageDto> {
    const { channel } = await this.access.requireChannel(channelId, userId);

    const message = await this.prisma.message.create({
      data: { channelId, authorId: userId, content: data.content },
      include: withAuthor,
    });

    // Emitido só depois de salvo: quem recebe o evento pode confiar que a mensagem existe.
    const dto = toMessageDto(message, data.nonce);
    this.realtime.emitToGuild(channel.guildId, 'message:created', dto);
    return dto;
  }

  async update(messageId: string, userId: string, data: UpdateMessageData): Promise<MessageDto> {
    const { message, guildId } = await this.findAccessible(messageId, userId);
    if (message.authorId !== userId) {
      throw new ForbiddenException('Só quem escreveu pode editar a mensagem');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: data.content, editedAt: new Date() },
      include: withAuthor,
    });

    const dto = toMessageDto(updated);
    this.realtime.emitToGuild(guildId, 'message:updated', dto);
    return dto;
  }

  /** O autor apaga a própria mensagem; o dono do servidor apaga qualquer uma. */
  async remove(messageId: string, userId: string): Promise<void> {
    const { message, guildId, role } = await this.findAccessible(messageId, userId);
    if (message.authorId !== userId && role !== 'OWNER') {
      throw new ForbiddenException('Você não pode apagar esta mensagem');
    }

    await this.prisma.message.delete({ where: { id: messageId } });
    this.realtime.emitToGuild(guildId, 'message:deleted', {
      id: messageId,
      channelId: message.channelId,
    });
  }

  private async findAccessible(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Mensagem não encontrada');

    try {
      const { channel, role } = await this.access.requireChannel(message.channelId, userId);
      return { message, guildId: channel.guildId, role };
    } catch {
      // Não membro: mesma resposta de "não existe".
      throw new NotFoundException('Mensagem não encontrada');
    }
  }
}
