import {
  apiErrorSchema,
  dmChannelSchema,
  guildSchema,
  guildWithChannelsSchema,
  inviteSchema,
  invitePreviewSchema,
  memberSchema,
  messagePageSchema,
} from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, http, resetDatabase, signUp, type TestUser } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe.runIf(process.env.DB_TESTS === '1')('Social (Postgres real)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let friend: TestUser;
  let outsider: TestUser;
  let guildId: string;
  let channelId: string;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
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
    await app.close();
  });

  async function createInvite(user = owner, expiresIn?: string) {
    const res = await http(app)
      .post(`/api/guilds/${guildId}/invites`)
      .set(...user.auth)
      .send(expiresIn ? { expiresIn } : {})
      .expect(201);
    return inviteSchema.parse(res.body);
  }

  async function join(user: TestUser) {
    const { code } = await createInvite();
    await http(app)
      .post(`/api/invites/${code}`)
      .set(...user.auth)
      .expect(200);
  }

  async function members(user = owner) {
    const res = await http(app)
      .get(`/api/guilds/${guildId}/members`)
      .set(...user.auth)
      .expect(200);
    return memberSchema.array().parse(res.body);
  }

  describe('convites', () => {
    it('cria convite de 7 dias por padrão; "never" não expira', async () => {
      const weekly = await createInvite();
      const forever = await createInvite(owner, 'never');

      expect(weekly.code).toMatch(/^[\w-]{8}$/);
      const ttl = Date.parse(weekly.expiresAt!) - Date.now();
      expect(ttl).toBeGreaterThan(7 * DAY_MS - 60_000);
      expect(ttl).toBeLessThanOrEqual(7 * DAY_MS);
      expect(forever.expiresAt).toBeNull();
    });

    it('quem é de fora não cria convite (404)', async () => {
      await http(app)
        .post(`/api/guilds/${guildId}/invites`)
        .set(...outsider.auth)
        .send({})
        .expect(404);
    });

    it('prévia mostra o servidor e se a pessoa já é membro', async () => {
      const { code } = await createInvite();

      const forFriend = await http(app)
        .get(`/api/invites/${code}`)
        .set(...friend.auth)
        .expect(200);
      const forOwner = await http(app)
        .get(`/api/invites/${code}`)
        .set(...owner.auth)
        .expect(200);

      expect(invitePreviewSchema.parse(forFriend.body)).toMatchObject({
        guild: { id: guildId, name: 'Os Amigos' },
        memberCount: 1,
        alreadyMember: false,
      });
      expect(invitePreviewSchema.parse(forOwner.body).alreadyMember).toBe(true);
    });

    it('aceitar coloca a pessoa no servidor e conta um uso; aceitar de novo não duplica', async () => {
      const { code } = await createInvite();

      const res = await http(app)
        .post(`/api/invites/${code}`)
        .set(...friend.auth)
        .expect(200);
      await http(app)
        .post(`/api/invites/${code}`)
        .set(...friend.auth)
        .expect(200);

      expect(guildWithChannelsSchema.parse(res.body).channels[0]?.name).toBe('geral');
      const invite = await app.get(PrismaService).invite.findUniqueOrThrow({ where: { code } });
      expect(invite.uses).toBe(1);
      expect(await members()).toHaveLength(2);

      const list = await http(app)
        .get('/api/guilds')
        .set(...friend.auth)
        .expect(200);
      expect(
        guildSchema
          .array()
          .parse(list.body)
          .map((g) => g.id),
      ).toEqual([guildId]);
    });

    it('convite expirado ou revogado responde 404', async () => {
      const expired = await createInvite();
      const revoked = await createInvite();
      await app.get(PrismaService).invite.update({
        where: { code: expired.code },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http(app)
        .delete(`/api/invites/${revoked.code}`)
        .set(...owner.auth)
        .expect(204);

      for (const { code } of [expired, revoked]) {
        const res = await http(app)
          .post(`/api/invites/${code}`)
          .set(...friend.auth)
          .expect(404);
        expect(apiErrorSchema.parse(res.body).message).toMatch(/Convite inválido|não encontrado/);
      }
    });

    it('só o dono lista e revoga convites', async () => {
      await join(friend);
      const invite = await createInvite(friend);

      await http(app)
        .get(`/api/guilds/${guildId}/invites`)
        .set(...friend.auth)
        .expect(403);
      await http(app)
        .delete(`/api/invites/${invite.code}`)
        .set(...friend.auth)
        .expect(403);

      const res = await http(app)
        .get(`/api/guilds/${guildId}/invites`)
        .set(...owner.auth)
        .expect(200);
      const created = inviteSchema
        .array()
        .parse(res.body)
        .find((i) => i.code === invite.code);
      expect(created?.creator.username).toBe('amigo');
    });

    it('código malformado vira 400', async () => {
      await http(app)
        .get('/api/invites/a!b')
        .set(...friend.auth)
        .expect(400);
    });
  });

  describe('membros', () => {
    it('lista os membros com papel; quem é de fora recebe 404', async () => {
      await join(friend);

      const list = await members();

      expect(list.map((m) => [m.user.username, m.role])).toEqual([
        ['dono', 'OWNER'],
        ['amigo', 'MEMBER'],
      ]);
      expect(Object.keys(list[0]!.user).sort()).toEqual(['displayName', 'id', 'username']);
      await http(app)
        .get(`/api/guilds/${guildId}/members`)
        .set(...outsider.auth)
        .expect(404);
    });

    it('membro sai do servidor; o dono não pode sair', async () => {
      await join(friend);

      await http(app)
        .post(`/api/guilds/${guildId}/leave`)
        .set(...friend.auth)
        .expect(204);
      await http(app)
        .post(`/api/guilds/${guildId}/leave`)
        .set(...owner.auth)
        .expect(409);

      expect((await members()).map((m) => m.user.username)).toEqual(['dono']);
      await http(app)
        .get(`/api/channels/${channelId}/messages`)
        .set(...friend.auth)
        .expect(404);
    });

    it('só o dono expulsa, e não a si mesmo', async () => {
      await join(friend);
      const third = await signUp(app, 'terceiro');
      await join(third);

      await http(app)
        .delete(`/api/guilds/${guildId}/members/${third.id}`)
        .set(...friend.auth)
        .expect(403);
      await http(app)
        .delete(`/api/guilds/${guildId}/members/${owner.id}`)
        .set(...owner.auth)
        .expect(409);
      await http(app)
        .delete(`/api/guilds/${guildId}/members/${outsider.id}`)
        .set(...owner.auth)
        .expect(404);
      await http(app)
        .delete(`/api/guilds/${guildId}/members/${third.id}`)
        .set(...owner.auth)
        .expect(204);

      expect((await members()).map((m) => m.user.username)).toEqual(['dono', 'amigo']);
    });
  });

  describe('mensagens diretas', () => {
    async function openDm(from: TestUser, to: TestUser, status = 200) {
      return http(app)
        .post('/api/dms')
        .set(...from.auth)
        .send({ userId: to.id })
        .expect(status);
    }

    it('só abre DM com quem divide um servidor', async () => {
      await openDm(owner, outsider, 404);
      await join(friend);

      const res = await openDm(owner, friend);

      expect(dmChannelSchema.parse(res.body)).toMatchObject({
        type: 'DM',
        recipient: { username: 'amigo' },
        lastMessageAt: null,
      });
    });

    it('a mesma conversa para os dois lados, sem duplicar', async () => {
      await join(friend);

      const a = dmChannelSchema.parse((await openDm(owner, friend)).body);
      const b = dmChannelSchema.parse((await openDm(friend, owner)).body);
      const again = dmChannelSchema.parse((await openDm(owner, friend)).body);

      expect(b.id).toBe(a.id);
      expect(again.id).toBe(a.id);
      expect(b.recipient.username).toBe('dono');
      expect(await app.get(PrismaService).channel.count({ where: { type: 'DM' } })).toBe(1);
    });

    it('não abre DM consigo mesmo', async () => {
      await openDm(owner, owner, 400);
    });

    it('os dois conversam; um terceiro (mesmo do servidor) não lê', async () => {
      await join(friend);
      const third = await signUp(app, 'terceiro');
      await join(third);
      const dm = dmChannelSchema.parse((await openDm(owner, friend)).body);

      await http(app)
        .post(`/api/channels/${dm.id}/messages`)
        .set(...owner.auth)
        .send({ content: 'oi, só pra você' })
        .expect(201);

      const page = await http(app)
        .get(`/api/channels/${dm.id}/messages`)
        .set(...friend.auth)
        .expect(200);
      expect(messagePageSchema.parse(page.body).messages[0]?.content).toBe('oi, só pra você');

      await http(app)
        .get(`/api/channels/${dm.id}/messages`)
        .set(...third.auth)
        .expect(404);
    });

    it('em DM ninguém apaga mensagem do outro, e o canal não pode ser renomeado/apagado', async () => {
      await join(friend);
      const dm = dmChannelSchema.parse((await openDm(owner, friend)).body);
      const sent = await http(app)
        .post(`/api/channels/${dm.id}/messages`)
        .set(...friend.auth)
        .send({ content: 'minha' })
        .expect(201);

      await http(app)
        .delete(`/api/messages/${(sent.body as { id: string }).id}`)
        .set(...owner.auth)
        .expect(403);
      await http(app)
        .patch(`/api/channels/${dm.id}`)
        .set(...owner.auth)
        .send({ name: 'x' })
        .expect(404);
      await http(app)
        .delete(`/api/channels/${dm.id}`)
        .set(...owner.auth)
        .expect(404);
    });

    it('lista as DMs da mais recente para a mais antiga', async () => {
      await join(friend);
      const third = await signUp(app, 'terceiro');
      await join(third);
      const withFriend = dmChannelSchema.parse((await openDm(owner, friend)).body);
      const withThird = dmChannelSchema.parse((await openDm(owner, third)).body);
      await http(app)
        .post(`/api/channels/${withFriend.id}/messages`)
        .set(...owner.auth)
        .send({ content: 'mais recente' })
        .expect(201);

      const res = await http(app)
        .get('/api/dms')
        .set(...owner.auth)
        .expect(200);

      expect(
        dmChannelSchema
          .array()
          .parse(res.body)
          .map((d) => d.id),
      ).toEqual([withFriend.id, withThird.id]);
    });
  });
});
