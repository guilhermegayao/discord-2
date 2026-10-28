import {
  type ClientToServerEvents,
  guildWithChannelsSchema,
  type ServerToClientEvents,
} from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, http, resetDatabase, signUp, type TestUser } from './helpers.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ServerToClientEvents;

/**
 * Tempo real ponta a ponta: o app escuta numa porta de verdade e os testes
 * conectam com o socket.io-client, como o navegador faria.
 */
describe.runIf(process.env.DB_TESTS === '1')('Tempo real (Socket.IO + Postgres real)', () => {
  let app: INestApplication;
  let url: string;
  const sockets: ClientSocket[] = [];

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    await app.listen(0);
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    url = `http://localhost:${port}`;
  });

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await app.close();
  });

  function connect(token?: string): ClientSocket {
    const socket: ClientSocket = io(url, {
      path: '/api/socket.io',
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  function connected(socket: ClientSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
  }

  /** Espera um evento (ou falha depois de um tempo). */
  function next<E extends EventName>(
    socket: ClientSocket,
    event: E,
    timeoutMs = 2000,
  ): Promise<Parameters<ServerToClientEvents[E]>[0]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`não chegou ${event}`)), timeoutMs);
      const listener = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
        clearTimeout(timer);
        resolve(payload);
      };
      // O socket.io-client tipa o listener por evento; aqui o evento é genérico.
      socket.once(event, listener as never);
    });
  }

  /** Garante que um evento NÃO chega dentro de uma janela de tempo. */
  async function expectNothing(socket: ClientSocket, event: EventName, windowMs = 300) {
    let received = false;
    socket.once(event, () => (received = true));
    await new Promise((r) => setTimeout(r, windowMs));
    expect(received).toBe(false);
  }

  async function createGuild(user: TestUser, name = 'Os Amigos') {
    const res = await http(app)
      .post('/api/guilds')
      .set(...user.auth)
      .send({ name })
      .expect(201);
    return guildWithChannelsSchema.parse(res.body);
  }

  it('recusa conexão sem token', async () => {
    await expect(connected(connect())).rejects.toThrow('unauthorized');
  });

  it('recusa conexão com token inválido', async () => {
    await expect(connected(connect('token-falso'))).rejects.toThrow('unauthorized');
  });

  it('mensagem enviada pela API chega a todos os sockets dos membros, com o nonce', async () => {
    const owner = await signUp(app, 'dono');
    const guild = await createGuild(owner);
    const tabA = connect(owner.token);
    const tabB = connect(owner.token);
    await Promise.all([connected(tabA), connected(tabB)]);

    const [inA, inB] = await Promise.all([
      next(tabA, 'message:created'),
      next(tabB, 'message:created'),
      http(app)
        .post(`/api/channels/${guild.channels[0]!.id}/messages`)
        .set(...owner.auth)
        .send({ content: 'oi em tempo real', nonce: 'n-1' })
        .expect(201),
    ]);

    expect(inA).toMatchObject({ content: 'oi em tempo real', nonce: 'n-1' });
    expect(inB.id).toBe(inA.id);
  });

  it('quem não é membro não recebe eventos do servidor', async () => {
    const owner = await signUp(app, 'dono');
    const outsider = await signUp(app, 'intruso');
    const guild = await createGuild(owner);
    const spy = connect(outsider.token);
    await connected(spy);

    const nothing = expectNothing(spy, 'message:created');
    await http(app)
      .post(`/api/channels/${guild.channels[0]!.id}/messages`)
      .set(...owner.auth)
      .send({ content: 'segredo' })
      .expect(201);
    await nothing;
  });

  it('servidor criado em uma aba aparece na outra, que já passa a ouvir as mensagens dele', async () => {
    const owner = await signUp(app, 'dono');
    const otherTab = connect(owner.token);
    await connected(otherTab);

    const [created] = await Promise.all([next(otherTab, 'guild:created'), createGuild(owner)]);
    expect(created.channels[0]?.name).toBe('geral');

    const [message] = await Promise.all([
      next(otherTab, 'message:created'),
      http(app)
        .post(`/api/channels/${created.channels[0]!.id}/messages`)
        .set(...owner.auth)
        .send({ content: 'já estou ouvindo?' })
        .expect(201),
    ]);
    expect(message.content).toBe('já estou ouvindo?');
  });

  it('edição, exclusão de mensagem e criação de canal viram eventos', async () => {
    const owner = await signUp(app, 'dono');
    const guild = await createGuild(owner);
    const channelId = guild.channels[0]!.id;
    const socket = connect(owner.token);
    await connected(socket);

    const [, sent] = await Promise.all([
      next(socket, 'message:created'),
      http(app)
        .post(`/api/channels/${channelId}/messages`)
        .set(...owner.auth)
        .send({ content: 'v1' }),
    ]);
    const messageId = (sent.body as { id: string }).id;

    const [updated] = await Promise.all([
      next(socket, 'message:updated'),
      http(app)
        .patch(`/api/messages/${messageId}`)
        .set(...owner.auth)
        .send({ content: 'v2' }),
    ]);
    expect(updated).toMatchObject({ id: messageId, content: 'v2' });

    const [deleted] = await Promise.all([
      next(socket, 'message:deleted'),
      http(app)
        .delete(`/api/messages/${messageId}`)
        .set(...owner.auth),
    ]);
    expect(deleted).toEqual({ id: messageId, channelId });

    const [channel] = await Promise.all([
      next(socket, 'channel:created'),
      http(app)
        .post(`/api/guilds/${guild.id}/channels`)
        .set(...owner.auth)
        .send({ name: 'jogos' }),
    ]);
    expect(channel).toMatchObject({ guildId: guild.id, name: 'jogos' });
  });

  it('servidor apagado: membros recebem guild:deleted e deixam de ouvir a sala', async () => {
    const owner = await signUp(app, 'dono');
    const member = await signUp(app, 'membro');
    const guild = await createGuild(owner);
    await app.get(PrismaService).member.create({ data: { guildId: guild.id, userId: member.id } });
    const memberSocket = connect(member.token);
    await connected(memberSocket);

    const [deleted] = await Promise.all([
      next(memberSocket, 'guild:deleted'),
      http(app)
        .delete(`/api/guilds/${guild.id}`)
        .set(...owner.auth)
        .expect(204),
    ]);

    expect(deleted).toEqual({ id: guild.id });
  });
});
