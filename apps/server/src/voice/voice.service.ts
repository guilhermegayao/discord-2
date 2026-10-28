import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import type { VoiceChannelStateDto, VoiceTokenDto } from '@discord-2/shared';
import { AccessToken, TrackSource, type WebhookEvent } from 'livekit-server-sdk';
import { ChatAccessService } from '../access/chat-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { LIVEKIT, type LiveKit } from './livekit.provider.js';
import { VoiceRegistry } from './voice-registry.js';

/** O token só serve para entrar; depois de conectado, a sessão segue sem ele. */
const TOKEN_TTL = '10m';

const publicUser = { id: true, username: true, displayName: true } as const;

@Injectable()
export class VoiceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    @Inject(LIVEKIT) private readonly livekit: LiveKit,
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly realtime: RealtimeGateway,
    private readonly registry: VoiceRegistry,
  ) {}

  /**
   * Credencial para entrar na sala do LiveKit de um canal de voz.
   * Sala = id do canal; identidade = id do usuário. Nesta fase só o
   * microfone pode ser transmitido (a tela entra na Fase 5).
   */
  async createToken(channelId: string, userId: string): Promise<VoiceTokenDto> {
    const { channel } = await this.access.requireGuildChannel(channelId, userId);
    if (channel.type !== 'VOICE') throw new BadRequestException('Este não é um canal de voz');

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: publicUser,
    });

    const token = new AccessToken(this.livekit.apiKey, this.livekit.apiSecret, {
      identity: user.id,
      name: user.displayName,
      ttl: TOKEN_TTL,
      metadata: JSON.stringify({ username: user.username }),
    });
    token.addGrant({
      room: channelId,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE],
    });

    return { url: this.livekit.url, token: await token.toJwt() };
  }

  async statesForGuild(guildId: string, userId: string): Promise<VoiceChannelStateDto[]> {
    await this.access.requireMember(guildId, userId);
    return this.registry.forGuild(guildId);
  }

  /**
   * Eventos do LiveKit. A assinatura (JWT com o hash do corpo, feito com o
   * nosso segredo) prova que veio do nosso LiveKit; sem ela, 401.
   */
  async handleWebhook(body: string, authorization: string | undefined): Promise<void> {
    let event: WebhookEvent;
    try {
      event = await this.livekit.webhooks.receive(body, authorization);
    } catch {
      throw new UnauthorizedException('Webhook com assinatura inválida');
    }

    const channelId = event.room?.name;
    const userId = event.participant?.identity;
    if (!channelId) return;

    switch (event.event) {
      case 'participant_joined':
        if (userId) await this.trackJoin(channelId, userId);
        break;
      case 'participant_left':
      case 'participant_connection_aborted':
        if (userId) this.emitState(this.registry.leave(channelId, userId), channelId);
        break;
      case 'room_finished':
        this.emitState(this.registry.clear(channelId), channelId);
        break;
      default:
        break;
    }
  }

  /** Ao sair ou ser expulso do servidor, a pessoa também cai da voz dele. */
  async disconnectFromGuild(userId: string, guildId: string): Promise<void> {
    for (const channelId of this.registry.channelsOf(userId, guildId)) {
      await this.livekit.rooms
        .removeParticipant(channelId, userId)
        .catch((err: unknown) =>
          this.logger.warn(`remover ${userId} de ${channelId}: ${String(err)}`),
        );
    }
  }

  /** Canal de voz apagado: encerra a sala (todo mundo cai). */
  async closeChannel(channelId: string): Promise<void> {
    this.registry.clear(channelId);
    await this.livekit.rooms
      .deleteRoom(channelId)
      .catch((err: unknown) => this.logger.warn(`encerrar sala ${channelId}: ${String(err)}`));
  }

  /**
   * Se o servidor reiniciar com gente na voz, recupera o estado perguntando
   * ao LiveKit. Se o LiveKit estiver fora, só avisa no log.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.livekit.syncOnStart) return;
    try {
      const rooms = await this.livekit.rooms.listRooms();
      for (const room of rooms) {
        const participants = await this.livekit.rooms.listParticipants(room.name);
        for (const p of participants) await this.trackJoin(room.name, p.identity, false);
      }
      this.logger.log(`voz sincronizada com o LiveKit (${rooms.length} salas)`);
    } catch (err) {
      this.logger.warn(`não foi possível sincronizar a voz com o LiveKit: ${String(err)}`);
    }
  }

  private async trackJoin(channelId: string, userId: string, emit = true): Promise<void> {
    const channel = await this.prisma.channel
      .findUnique({ where: { id: channelId }, select: { guildId: true, type: true } })
      .catch(() => null); // nome de sala que não é um UUID nosso
    if (!channel?.guildId || channel.type !== 'VOICE') return;

    const member = await this.prisma.member.findUnique({
      where: { guildId_userId: { guildId: channel.guildId, userId } },
      include: { user: { select: publicUser } },
    });
    if (!member) {
      // Token emitido antes de a pessoa sair/ser expulsa: tira da sala.
      await this.livekit.rooms.removeParticipant(channelId, userId).catch(() => undefined);
      return;
    }

    this.registry.join(channelId, channel.guildId, member.user);
    if (emit) this.emitState(channel.guildId, channelId);
  }

  private emitState(guildId: string | undefined, channelId: string): void {
    if (!guildId) return;
    this.realtime.emitToGuild(guildId, 'voice:state', {
      guildId,
      ...this.registry.state(channelId),
    });
  }
}
