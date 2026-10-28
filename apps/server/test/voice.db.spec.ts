import {
  apiErrorSchema,
  channelSchema,
  guildWithChannelsSchema,
  inviteSchema,
  voiceChannelStateSchema,
  voiceTokenSchema,
} from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import { AccessToken, TokenVerifier, WebhookReceiver } from 'livekit-server-sdk';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVEKIT, type LiveKit } from '../src/voice/livekit.provider.js';
import { createTestApp, http, resetDatabase, signUp, type TestUser } from './helpers.js';
import { expectNothing, next, socketTestKit } from './socket-helpers.js';

// Os mesmos valores do vitest.config.ts
const KEY = 'chave-de-teste';
const SECRET = 'segredo-de-teste-do-livekit-com-32-caracteres';

describe.runIf(process.env.DB_TESTS === '1')('Voz (Postgres real, LiveKit simulado)', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof socketTestKit>>;
  let rooms: { [K in keyof LiveKit['rooms']]: ReturnType<typeof vi.fn> };
  let owner: TestUser;
  let friend: TestUser;
  let outsider: TestUser;
  let guildId: string;
  let textChannelId: string;
  let voiceChannelId: string;

  beforeEach(async () => {
    rooms = {
      listRooms: vi.fn().mockResolvedValue([]),
      listParticipants: vi.fn().mockResolvedValue([]),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
      deleteRoom: vi.fn().mockResolvedValue(undefined),
    };
    const fakeLiveKit: LiveKit = {
      url: 'ws://localhost:7890',
      apiKey: KEY,
      apiSecret: SECRET,
      syncOnStart: false,
      rooms: rooms as unknown as LiveKit['rooms'],
      webhooks: new WebhookReceiver(KEY, SECRET),
    };
    app = await createTestApp((b) => b.overrideProvider(LIVEKIT).useValue(fakeLiveKit));
    await resetDatabase(app);
    kit = await socketTestKit(app);

    owner = await signUp(app, 'dono');
    friend = await signUp(app, 'amigo');
    outsider = await signUp(app, 'intruso');
    const guild = guildWithChannelsSchema.parse(
      (
        await http(app)
          .post('/api/guilds')
          .set(...owner.auth)
          .send({ name: 'Os Amigos' })
          .expect(201)
      ).body,
    );
    guildId = guild.id;
    textChannelId = guild.channels[0]!.id;
    const voice = channelSchema.parse(
      (
        await http(app)
          .post(`/api/guilds/${guildId}/channels`)
          .set(...owner.auth)
          .send({ name: 'Bate Papo', type: 'VOICE' })
          .expect(201)
      ).body,
    );
    voiceChannelId = voice.id;

    const invite = inviteSchema.parse(
      (
        await http(app)
          .post(`/api/guilds/${guildId}/invites`)
          .set(...owner.auth)
          .send({})
          .expect(201)
      ).body,
    );
    await http(app)
      .post(`/api/invites/${invite.code}`)
      .set(...friend.auth)
      .expect(200);
  });

  afterEach(async () => {
    kit.closeAll();
    await app.close();
  });

  /** Envia um webhook assinado como o LiveKit faria e confere o status. */
  async function webhook(event: string, identity?: string, room = voiceChannelId) {
    const body = JSON.stringify({
      event,
      id: `evt-${Math.random()}`,
      createdAt: String(Math.floor(Date.now() / 1000)),
      room: { name: room },
      ...(identity && { participant: { identity } }),
    });
    const signer = new AccessToken(KEY, SECRET);
    signer.sha256 = createHash('sha256').update(body).digest('base64');
    return http(app)
      .post('/api/livekit/webhook')
      .set('Content-Type', 'application/webhook+json')
      .set('Authorization', await signer.toJwt())
      .send(body)
      .expect(200);
  }

  async function voiceStates(user = owner) {
    const res = await http(app)
      .get(`/api/guilds/${guildId}/voice-states`)
      .set(...user.auth)
      .expect(200);
    return voiceChannelStateSchema.array().parse(res.body);
  }

  describe('canal de voz', () => {
    it('é criado com o tipo VOICE e não aceita mensagens', async () => {
      const res = await http(app)
        .post(`/api/channels/${voiceChannelId}/messages`)
        .set(...owner.auth)
        .send({ content: 'oi' })
        .expect(400);

      expect(apiErrorSchema.parse(res.body).message).toBe('Canais de voz não têm mensagens');
    });

    it('pode ser apagado mesmo sendo o único de voz, e a sala do LiveKit é encerrada', async () => {
      await http(app)
        .delete(`/api/channels/${voiceChannelId}`)
        .set(...owner.auth)
        .expect(204);

      expect(rooms.deleteRoom).toHaveBeenCalledWith(voiceChannelId);
    });
  });

  describe('token', () => {
    it('membro recebe um token só para esta sala, só com microfone', async () => {
      const res = await http(app)
        .post(`/api/channels/${voiceChannelId}/voice-token`)
        .set(...friend.auth)
        .expect(200);
      const { url, token } = voiceTokenSchema.parse(res.body);

      const claims = await new TokenVerifier(KEY, SECRET).verify(token);
      expect(url).toBe('ws://localhost:7890');
      expect(claims.sub).toBe(friend.id);
      expect(claims.name).toBe('amigo');
      expect(claims.video).toMatchObject({
        room: voiceChannelId,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: ['microphone'],
      });
      // Sem permissões de administração da sala
      expect(claims.video?.roomAdmin).toBeFalsy();
      expect(claims.video?.roomCreate).toBeFalsy();
    });

    it('expira em poucos minutos', async () => {
      const res = await http(app)
        .post(`/api/channels/${voiceChannelId}/voice-token`)
        .set(...friend.auth)
        .expect(200);
      const claims = await new TokenVerifier(KEY, SECRET).verify(
        voiceTokenSchema.parse(res.body).token,
      );

      const ttlSeconds = claims.exp! - Math.floor(Date.now() / 1000);
      expect(ttlSeconds).toBeGreaterThan(0);
      expect(ttlSeconds).toBeLessThanOrEqual(10 * 60);
    });

    it('não sai para canal de texto (400) nem para quem é de fora (404)', async () => {
      await http(app)
        .post(`/api/channels/${textChannelId}/voice-token`)
        .set(...owner.auth)
        .expect(400);
      await http(app)
        .post(`/api/channels/${voiceChannelId}/voice-token`)
        .set(...outsider.auth)
        .expect(404);
    });
  });

  describe('webhook do LiveKit', () => {
    it('sem assinatura ou com assinatura de outro segredo: 401', async () => {
      await http(app)
        .post('/api/livekit/webhook')
        .set('Content-Type', 'application/webhook+json')
        .send('{"event":"participant_joined"}')
        .expect(401);

      const forged = new AccessToken(KEY, 'outro-segredo-qualquer-com-32-caracteres');
      forged.sha256 = createHash('sha256').update('{}').digest('base64');
      await http(app)
        .post('/api/livekit/webhook')
        .set('Content-Type', 'application/webhook+json')
        .set('Authorization', await forged.toJwt())
        .send('{}')
        .expect(401);
    });

    it('entrada e saída viram voice:state para os membros do servidor', async () => {
      const ownerSocket = await kit.connectReady(owner.token);
      const spy = await kit.connectReady(outsider.token);
      const nothing = expectNothing(spy, 'voice:state', 500);

      const [joined] = await Promise.all([
        next(ownerSocket, 'voice:state'),
        webhook('participant_joined', friend.id),
      ]);
      expect(joined).toEqual({
        guildId,
        channelId: voiceChannelId,
        participants: [{ id: friend.id, username: 'amigo', displayName: 'amigo' }],
      });
      expect(await voiceStates()).toEqual([
        { channelId: voiceChannelId, participants: joined.participants },
      ]);

      const [left] = await Promise.all([
        next(ownerSocket, 'voice:state'),
        webhook('participant_left', friend.id),
      ]);
      expect(left.participants).toEqual([]);
      expect(await voiceStates()).toEqual([]);
      await nothing;
    });

    it('o mesmo evento repetido não duplica a pessoa', async () => {
      await webhook('participant_joined', friend.id);
      await webhook('participant_joined', friend.id);

      expect((await voiceStates())[0]?.participants).toHaveLength(1);
    });

    it('quem entrou na sala sem ser membro é removido e não aparece', async () => {
      await webhook('participant_joined', outsider.id);

      expect(rooms.removeParticipant).toHaveBeenCalledWith(voiceChannelId, outsider.id);
      expect(await voiceStates()).toEqual([]);
    });

    it('room_finished limpa o canal', async () => {
      await webhook('participant_joined', friend.id);
      await webhook('participant_joined', owner.id);

      await webhook('room_finished');

      expect(await voiceStates()).toEqual([]);
    });

    it('quem é de fora não consulta o estado de voz (404)', async () => {
      await http(app)
        .get(`/api/guilds/${guildId}/voice-states`)
        .set(...outsider.auth)
        .expect(404);
    });
  });

  it('expulsar alguém que está na voz também o tira da sala do LiveKit', async () => {
    await webhook('participant_joined', friend.id);

    await http(app)
      .delete(`/api/guilds/${guildId}/members/${friend.id}`)
      .set(...owner.auth)
      .expect(204);

    expect(rooms.removeParticipant).toHaveBeenCalledWith(voiceChannelId, friend.id);
  });

  it('apagar o servidor encerra as salas de voz dele', async () => {
    await http(app)
      .delete(`/api/guilds/${guildId}`)
      .set(...owner.auth)
      .expect(204);

    expect(rooms.deleteRoom).toHaveBeenCalledWith(voiceChannelId);
  });
});
