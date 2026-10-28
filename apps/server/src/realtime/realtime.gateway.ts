import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  type OnGatewayConnection,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { ClientToServerEvents, ServerToClientEvents } from '@discord-2/shared';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface SocketData {
  userId: string;
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

/**
 * Canal de tempo real. Só o servidor emite eventos; o cliente escreve pela API
 * REST. Cada socket entra numa sala por servidor de que participa, então um
 * evento de um servidor só chega a quem é membro dele.
 */
@WebSocketGateway({ path: '/api/socket.io', serveClient: false })
export class RealtimeGateway
  implements OnGatewayInit<TypedServer>, OnGatewayConnection<TypedSocket>
{
  @WebSocketServer() private server!: TypedServer;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

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
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      select: { guildId: true },
    });
    await socket.join([userRoom(userId), ...memberships.map((m) => guildRoom(m.guildId))]);
    this.logger.debug(
      `socket ${socket.id} conectado (usuário ${userId}, ${memberships.length} servidores)`,
    );
  }

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

  /** Coloca todos os sockets abertos do usuário na sala do servidor (ao criar ou entrar). */
  addUserToGuild(userId: string, guildId: string): void {
    this.server.in(userRoom(userId)).socketsJoin(guildRoom(guildId));
  }

  /** Esvazia a sala de um servidor apagado. */
  closeGuild(guildId: string): void {
    this.server.in(guildRoom(guildId)).socketsLeave(guildRoom(guildId));
  }
}
