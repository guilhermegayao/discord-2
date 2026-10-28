import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  type ClientToServerEvents,
  type PublicUserDto,
  type ServerToClientEvents,
  typingStartSchema,
} from '@discord-2/shared';
import type { Server, Socket } from 'socket.io';
import { ChatAccessService } from '../access/chat-access.service.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface SocketData {
  userId: string;
  user: PublicUserDto;
  /** Último "digitando" aceito por canal (anti-flood). */
  lastTypingAt: Map<string, number>;
}

type EmptyEvents = Record<string, never>;
export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  EmptyEvents,
  SocketData
>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, EmptyEvents, SocketData>;
type EventName = keyof ServerToClientEvents;

export const guildRoom = (guildId: string) => `guild:${guildId}`;
export const userRoom = (userId: string) => `user:${userId}`;

/** Intervalo mínimo entre dois "digitando" do mesmo socket no mesmo canal. */
const TYPING_MIN_INTERVAL_MS = 2000;

/**
 * Canal de tempo real. Quase tudo é o servidor avisando os clientes; a única
 * coisa que o cliente envia é "estou digitando" (efêmero, não vai para o banco).
 *
 * Salas: uma por servidor (`guild:<id>`) e uma por usuário (`user:<id>`, com
 * todas as abas dele). DMs usam as salas dos dois participantes.
 */
@WebSocketGateway({ path: '/api/socket.io', serveClient: false })
export class RealtimeGateway
  implements
    OnGatewayInit<TypedServer>,
    OnGatewayConnection<TypedSocket>,
    OnGatewayDisconnect<TypedSocket>,
    OnModuleDestroy
{
  @WebSocketServer() private server!: TypedServer;
  private readonly logger = new Logger(RealtimeGateway.name);

  /** Presença: quantos sockets cada usuário tem abertos neste servidor Node. */
  private readonly connections = new Map<string, number>();
  /** Usuários sem nenhum socket, esperando o prazo antes de virar offline. */
  private readonly goingOffline = new Map<string, NodeJS.Timeout>();
  private readonly graceMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    config: ConfigService<Env, true>,
  ) {
    this.graceMs = config.get('PRESENCE_GRACE_MS', { infer: true });
  }

  /** Autentica no handshake: sem token válido, a conexão nem é aceita. */
  afterInit(server: TypedServer): void {
    server.use((socket, next) => {
      const token: unknown = (socket.handshake.auth as Record<string, unknown>).token;
      if (typeof token !== 'string' || token.length === 0) {
        next(new Error('unauthorized'));
        return;
      }
      this.jwt
        .verifyAsync<AccessTokenPayload>(token)
        .then((payload) => {
          socket.data.userId = payload.sub;
          next();
        })
        .catch(() => next(new Error('unauthorized')));
    });
  }

  async handleConnection(socket: TypedSocket): Promise<void> {
    const { userId } = socket.data;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        memberships: { select: { guildId: true } },
      },
    });
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const { memberships, ...publicUser } = user;
    socket.data.user = publicUser;
    socket.data.lastTypingAt = new Map();
    await socket.join([userRoom(userId), ...memberships.map((m) => guildRoom(m.guildId))]);
    this.markConnected(
      userId,
      memberships.map((m) => m.guildId),
    );
  }

  handleDisconnect(socket: TypedSocket): void {
    const { userId } = socket.data;
    if (!userId || !socket.data.user) return; // não chegou a conectar de fato
    this.markDisconnected(userId);
  }

  onModuleDestroy(): void {
    this.goingOffline.forEach((timer) => clearTimeout(timer));
    this.goingOffline.clear();
  }

  // ---------- Presença ----------

  isOnline(userId: string): boolean {
    return (this.connections.get(userId) ?? 0) > 0 || this.goingOffline.has(userId);
  }

  private markConnected(userId: string, guildIds: string[]): void {
    const pending = this.goingOffline.get(userId);
    if (pending) {
      // Voltou dentro do prazo (ex.: F5): ninguém chegou a ver offline.
      clearTimeout(pending);
      this.goingOffline.delete(userId);
    }
    const before = this.connections.get(userId) ?? 0;
    this.connections.set(userId, before + 1);
    if (before === 0 && !pending) this.announcePresence(userId, true, guildIds);
  }

  private markDisconnected(userId: string): void {
    const remaining = (this.connections.get(userId) ?? 1) - 1;
    if (remaining > 0) {
      this.connections.set(userId, remaining);
      return;
    }
    this.connections.delete(userId);
    const timer = setTimeout(() => {
      this.goingOffline.delete(userId);
      void this.prisma.member
        .findMany({ where: { userId }, select: { guildId: true } })
        .then((ms) =>
          this.announcePresence(
            userId,
            false,
            ms.map((m) => m.guildId),
          ),
        )
        .catch((err: unknown) => this.logger.warn(`presença de ${userId}: ${String(err)}`));
    }, this.graceMs);
    this.goingOffline.set(userId, timer);
  }

  private announcePresence(userId: string, online: boolean, guildIds: string[]): void {
    if (guildIds.length === 0) return;
    this.server.to(guildIds.map(guildRoom)).emit('presence:update', { userId, online });
  }

  // ---------- "Digitando..." ----------

  /**
   * O cliente avisa que está digitando. Validamos tudo: formato, frequência
   * e se a pessoa tem acesso ao canal. Se algo falhar, o evento é ignorado
   * em silêncio (não vale a pena responder erro para um dado efêmero).
   */
  @SubscribeMessage('typing:start')
  async handleTyping(@ConnectedSocket() socket: TypedSocket, @MessageBody() body: unknown) {
    const parsed = typingStartSchema.safeParse(body);
    if (!parsed.success || !socket.data.user) return;
    const { channelId } = parsed.data;

    const now = Date.now();
    const last = socket.data.lastTypingAt.get(channelId) ?? 0;
    if (now - last < TYPING_MIN_INTERVAL_MS) return;
    socket.data.lastTypingAt.set(channelId, now);

    const access = await this.access
      .requireChannel(channelId, socket.data.userId)
      .catch(() => null);
    if (!access) return;

    const rooms =
      access.kind === 'guild'
        ? [guildRoom(access.channel.guildId)]
        : access.participantIds.map(userRoom);
    // socket.to(...) não devolve o evento para o próprio socket.
    socket.to(rooms).emit('typing', { channelId, user: socket.data.user });
  }

  // ---------- Envio de eventos ----------

  emitToGuild<E extends EventName>(
    guildId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.server.to(guildRoom(guildId)).emit(event, ...args);
  }

  emitToUser<E extends EventName>(
    userId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.server.to(userRoom(userId)).emit(event, ...args);
  }

  emitToUsers<E extends EventName>(
    userIds: string[],
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    if (userIds.length === 0) return;
    this.server.to(userIds.map(userRoom)).emit(event, ...args);
  }

  /** Para eventos de canal: vai para a sala do servidor ou para os participantes da DM. */
  emitToAudience<E extends EventName>(
    audience: { guildId: string } | { userIds: string[] },
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    if ('guildId' in audience) this.emitToGuild(audience.guildId, event, ...args);
    else this.emitToUsers(audience.userIds, event, ...args);
  }

  /** Coloca todos os sockets abertos do usuário na sala do servidor (ao criar ou entrar). */
  addUserToGuild(userId: string, guildId: string): void {
    this.server.in(userRoom(userId)).socketsJoin(guildRoom(guildId));
  }

  /** Tira todos os sockets do usuário da sala (ao sair ou ser expulso). */
  removeUserFromGuild(userId: string, guildId: string): void {
    this.server.in(userRoom(userId)).socketsLeave(guildRoom(guildId));
  }

  /** Esvazia a sala de um servidor apagado. */
  closeGuild(guildId: string): void {
    this.server.in(guildRoom(guildId)).socketsLeave(guildRoom(guildId));
  }
}
