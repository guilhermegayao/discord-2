import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateInviteData,
  GuildWithChannelsDto,
  InviteDto,
  InviteExpiration,
  InvitePreviewDto,
} from '@discord-2/shared';
import { randomBytes } from 'node:crypto';
import { ChatAccessService } from '../access/chat-access.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import {
  publicUserSelect,
  toGuildWithChannelsDto,
  toInviteDto,
  toMemberDto,
} from './chat.mappers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRATION_MS: Record<InviteExpiration, number | null> = {
  '1d': DAY_MS,
  '7d': 7 * DAY_MS,
  never: null,
};

const withCreator = { creator: { select: publicUserSelect } } as const;

/** 6 bytes aleatórios = 8 caracteres no link, ~281 trilhões de combinações. */
function generateCode(): string {
  return randomBytes(6).toString('base64url');
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Qualquer membro pode convidar (padrão do Discord). */
  async create(guildId: string, userId: string, data: CreateInviteData): Promise<InviteDto> {
    await this.access.requireMember(guildId, userId);
    const ttl = EXPIRATION_MS[data.expiresIn];
    const expiresAt = ttl === null ? null : new Date(Date.now() + ttl);

    // Colisão de código é quase impossível, mas se acontecer tentamos outro.
    for (let attempt = 0; ; attempt++) {
      try {
        const invite = await this.prisma.invite.create({
          data: { code: generateCode(), guildId, creatorId: userId, expiresAt },
          include: withCreator,
        });
        return toInviteDto(invite);
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= 2) throw err;
      }
    }
  }

  /** Só o dono vê e revoga os convites do servidor. */
  async list(guildId: string, userId: string): Promise<InviteDto[]> {
    await this.access.requireOwner(guildId, userId);
    const invites = await this.prisma.invite.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      include: withCreator,
    });
    return invites.map(toInviteDto);
  }

  async revoke(code: string, userId: string): Promise<void> {
    const invite = await this.prisma.invite.findUnique({ where: { code } });
    if (!invite) throw new NotFoundException('Convite não encontrado');
    await this.access.requireOwner(invite.guildId, userId);
    await this.prisma.invite.delete({ where: { code } });
  }

  /** O que aparece para quem abriu o link, antes de aceitar. */
  async preview(code: string, userId: string): Promise<InvitePreviewDto> {
    const invite = await this.findValid(code);
    const [memberCount, membership] = await Promise.all([
      this.prisma.member.count({ where: { guildId: invite.guildId } }),
      this.prisma.member.findUnique({
        where: { guildId_userId: { guildId: invite.guildId, userId } },
      }),
    ]);
    return {
      code: invite.code,
      guild: { id: invite.guild.id, name: invite.guild.name },
      memberCount,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      alreadyMember: membership !== null,
    };
  }

  /**
   * Entra no servidor. Se a pessoa já é membro, só devolve o servidor (não
   * conta outro uso). A entrada e o contador de usos mudam juntos, numa transação.
   */
  async accept(code: string, userId: string): Promise<GuildWithChannelsDto> {
    const invite = await this.findValid(code);
    const { guildId } = invite;

    let joined = false;
    try {
      await this.prisma.$transaction([
        this.prisma.member.create({ data: { guildId, userId } }),
        this.prisma.invite.update({ where: { code }, data: { uses: { increment: 1 } } }),
      ]);
      joined = true;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // já era membro
    }

    const guild = await this.prisma.guild.findUniqueOrThrow({
      where: { id: guildId },
      include: { channels: { orderBy: { position: 'asc' } } },
    });
    const dto = toGuildWithChannelsDto(guild);

    if (joined) {
      const member = await this.prisma.member.findUniqueOrThrow({
        where: { guildId_userId: { guildId, userId } },
        include: { user: { select: publicUserSelect } },
      });
      // Avisa quem já estava no servidor, e só depois coloca a pessoa na sala.
      this.realtime.emitToGuild(guildId, 'member:joined', {
        guildId,
        member: toMemberDto(member, this.realtime.isOnline(userId)),
      });
      this.realtime.addUserToGuild(userId, guildId);
      this.realtime.emitToUser(userId, 'guild:created', dto);
    }
    return dto;
  }

  /** Convite que existe e não expirou. Expirado tem a mesma resposta de inexistente. */
  private async findValid(code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { guild: { select: { id: true, name: true } } },
    });
    if (!invite || (invite.expiresAt && invite.expiresAt <= new Date())) {
      throw new NotFoundException('Convite inválido ou expirado');
    }
    return invite;
  }
}
