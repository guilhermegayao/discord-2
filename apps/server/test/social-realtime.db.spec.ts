import {
  dmChannelSchema,
  guildWithChannelsSchema,
  inviteSchema,
  memberSchema,
} from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, http, resetDatabase, signUp, type TestUser } from './helpers.js';
import { collect, expectNothing, next, sleep, socketTestKit } from './socket-helpers.js';

/** PRESENCE_GRACE_MS nos testes é 200 ms (vitest.config.ts). */
const GRACE_MS = 200;

describe.runIf(process.env.DB_TESTS === '1')('Social em tempo real (Postgres real)', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof socketTestKit>>;
  let owner: TestUser;
  let friend: TestUser;
  let outsider: TestUser;
  let guildId: string;
  let channelId: string;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    kit = await socketTestKit(app);
    owner = await signUp(app, 'dono');
    friend = await signUp(app, 'amigo');
    outsider = await signUp(app, 'intruso');
    const res = await http(app)
      .post('/api/guilds')
      .set(...owner.auth)
      .send({ name: 'Os Amigos' })
      .expect(201);
    const guild = guildWithChannelsSchema.parse(res.body);
    guildId = guild.id;
    channelId = guild.channels[0]!.id;
  });

  afterEach(async () => {
    kit.closeAll();
    await app.close();
  });

  async function inviteCode() {
    const res = await http(app)
      .post(`/api/guilds/${guildId}/invites`)
      .set(...owner.auth)
      .send({})
      .expect(201);
    return inviteSchema.parse(res.body).code;
  }

  async function join(user: TestUser) {
    await http(app)
      .post(`/api/invites/${await inviteCode()}`)
      .set(...user.auth)
      .expect(200);
  }

  async function memberOnline(userId: string) {
    const res = await http(app)
      .get(`/api/guilds/${guildId}/members`)
      .set(...owner.auth)
      .expect(200);
    return memberSchema
      .array()
      .parse(res.body)
      .find((m) => m.user.id === userId)?.online;
  }

  function sendMessage(user: TestUser, content: string, channel = channelId) {
    return http(app)
      .post(`/api/channels/${channel}/messages`)
      .set(...user.auth)
      .send({ content })
      .expect(201);
  }

  describe('convite e saída', () => {
    it('quem entra pelo convite passa a ouvir o servidor; os outros veem member:joined', async () => {
      const ownerSocket = await kit.connectReady(owner.token);
      const friendSocket = await kit.connectReady(friend.token);

      const [joined, created] = await Promise.all([
        next(ownerSocket, 'member:joined'),
        next(friendSocket, 'guild:created'),
        join(friend),
      ]);
      expect(joined).toMatchObject({
        guildId,
        member: { user: { username: 'amigo' }, online: true },
      });
      expect(created.id).toBe(guildId);

      const [message] = await Promise.all([
        next(friendSocket, 'message:created'),
        sendMessage(owner, 'bem-vindo!'),
      ]);
      expect(message.content).toBe('bem-vindo!');
    });

    it('quem sai recebe guild:removed e deixa de receber mensagens; os outros veem member:left', async () => {
      await join(friend);
      const ownerSocket = await kit.connectReady(owner.token);
      const friendSocket = await kit.connectReady(friend.token);

      const [removed, left] = await Promise.all([
        next(friendSocket, 'guild:removed'),
        next(ownerSocket, 'member:left'),
        http(app)
          .post(`/api/guilds/${guildId}/leave`)
          .set(...friend.auth)
          .expect(204),
      ]);
      expect(removed).toEqual({ id: guildId });
      expect(left).toEqual({ guildId, userId: friend.id });

      const nothing = expectNothing(friendSocket, 'message:created');
      await sendMessage(owner, 'você não deveria ver isto');
      await nothing;
    });

    it('expulso também para de receber na hora', async () => {
      await join(friend);
      const friendSocket = await kit.connectReady(friend.token);

      await Promise.all([
        next(friendSocket, 'guild:removed'),
        http(app)
          .delete(`/api/guilds/${guildId}/members/${friend.id}`)
          .set(...owner.auth)
          .expect(204),
      ]);

      const nothing = expectNothing(friendSocket, 'message:created');
      await sendMessage(owner, 'segredo');
      await nothing;
    });
  });

  describe('presença', () => {
    it('conectar avisa os membros e aparece online na lista', async () => {
      await join(friend);
      const ownerSocket = await kit.connectReady(owner.token);
      expect(await memberOnline(friend.id)).toBe(false);

      const [online] = await Promise.all([
        next(ownerSocket, 'presence:update'),
        kit.connectReady(friend.token),
      ]);

      expect(online).toEqual({ userId: friend.id, online: true });
      expect(await memberOnline(friend.id)).toBe(true);
    });

    it('fechar uma de duas abas não derruba; fechar a última derruba depois do prazo', async () => {
      await join(friend);
      const ownerSocket = await kit.connectReady(owner.token);
      const tab1 = await kit.connectReady(friend.token);
      const tab2 = await kit.connectReady(friend.token);
      const updates = collect(ownerSocket, 'presence:update');

      tab1.disconnect();
      await sleep(GRACE_MS * 2);
      expect(updates.received).toEqual([]);
      expect(await memberOnline(friend.id)).toBe(true);

      tab2.disconnect();
      // Dentro do prazo ainda conta como online...
      expect(await memberOnline(friend.id)).toBe(true);
      // ...e depois do prazo vira offline.
      await sleep(GRACE_MS * 2);
      updates.stop();
      expect(updates.received).toEqual([{ userId: friend.id, online: false }]);
      expect(await memberOnline(friend.id)).toBe(false);
    });

    it('F5 dentro do prazo não pisca offline/online', async () => {
      await join(friend);
      const ownerSocket = await kit.connectReady(owner.token);
      const first = await kit.connectReady(friend.token);
      const updates = collect(ownerSocket, 'presence:update');

      first.disconnect();
      await sleep(GRACE_MS / 4);
      await kit.connectReady(friend.token);
      await sleep(GRACE_MS * 2);

      updates.stop();
      expect(updates.received).toEqual([]);
    });

    it('quem não é do servidor não recebe a presença dos membros', async () => {
      await join(friend);
      const spy = await kit.connectReady(outsider.token);

      const nothing = expectNothing(spy, 'presence:update');
      await kit.connectReady(friend.token);
      await nothing;
    });
  });

  describe('digitando', () => {
    it('chega aos outros membros, não ao próprio autor nem a quem é de fora', async () => {
      await join(friend);
      const ownerSocket = await kit.connectReady(owner.token);
      const friendSocket = await kit.connectReady(friend.token);
      const spy = await kit.connectReady(outsider.token);
      const self = collect(friendSocket, 'typing');
      const outside = collect(spy, 'typing');

      const [typing] = await Promise.all([
        next(ownerSocket, 'typing'),
        Promise.resolve(friendSocket.emit('typing:start', { channelId })),
      ]);

      expect(typing).toEqual({
        channelId,
        user: { id: friend.id, username: 'amigo', displayName: 'amigo' },
      });
      await sleep(200);
      expect(self.received).toEqual([]);
      expect(outside.received).toEqual([]);
    });

    it('limita a frequência: dois avisos seguidos viram um só', async () => {
      await join(friend);
      const ownerSocket = await kit.connectReady(owner.token);
      const friendSocket = await kit.connectReady(friend.token);
      const typing = collect(ownerSocket, 'typing');

      friendSocket.emit('typing:start', { channelId });
      friendSocket.emit('typing:start', { channelId });
      await sleep(300);

      typing.stop();
      expect(typing.received).toHaveLength(1);
    });

    it('ignora canal sem acesso e dados inválidos', async () => {
      const ownerSocket = await kit.connectReady(owner.token);
      const spy = await kit.connectReady(outsider.token);
      const typing = collect(ownerSocket, 'typing');

      spy.emit('typing:start', { channelId });
      spy.emit('typing:start', { channelId: 'nao-e-uuid' });
      await sleep(300);

      typing.stop();
      expect(typing.received).toEqual([]);
    });
  });

  describe('mensagens diretas', () => {
    it('a DM nova aparece para os dois, e as mensagens só chegam aos participantes', async () => {
      await join(friend);
      const third = await signUp(app, 'terceiro');
      await join(third);
      const ownerSocket = await kit.connectReady(owner.token);
      const friendSocket = await kit.connectReady(friend.token);
      const thirdSocket = await kit.connectReady(third.token);

      const [, dmForFriend, res] = await Promise.all([
        next(ownerSocket, 'dm:created'),
        next(friendSocket, 'dm:created'),
        http(app)
          .post('/api/dms')
          .set(...owner.auth)
          .send({ userId: friend.id })
          .expect(200),
      ]);
      const dm = dmChannelSchema.parse(res.body);
      expect(dmForFriend).toMatchObject({ id: dm.id, recipient: { username: 'dono' } });

      const nothing = expectNothing(thirdSocket, 'message:created');
      const [received] = await Promise.all([
        next(friendSocket, 'message:created'),
        sendMessage(owner, 'só entre nós', dm.id),
      ]);
      expect(received).toMatchObject({ channelId: dm.id, content: 'só entre nós' });
      await nothing;
    });

    it('"digitando" em DM vai só para o outro participante', async () => {
      await join(friend);
      const third = await signUp(app, 'terceiro');
      await join(third);
      const dm = dmChannelSchema.parse(
        (
          await http(app)
            .post('/api/dms')
            .set(...owner.auth)
            .send({ userId: friend.id })
            .expect(200)
        ).body,
      );
      const ownerSocket = await kit.connectReady(owner.token);
      const friendSocket = await kit.connectReady(friend.token);
      const thirdSocket = await kit.connectReady(third.token);

      const nothing = expectNothing(thirdSocket, 'typing');
      const [typing] = await Promise.all([
        next(friendSocket, 'typing'),
        Promise.resolve(ownerSocket.emit('typing:start', { channelId: dm.id })),
      ]);
      expect(typing.channelId).toBe(dm.id);
      await nothing;
    });
  });
});
