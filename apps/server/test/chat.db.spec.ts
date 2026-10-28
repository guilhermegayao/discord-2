import {
  apiErrorSchema,
  channelSchema,
  guildSchema,
  guildWithChannelsSchema,
  type MessageDto,
  messagePageSchema,
  messageSchema,
} from '@discord-2/shared';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, http, resetDatabase, signUp, type TestUser } from './helpers.js';

const MISSING_ID = '0190f0b2-0000-7000-8000-000000000000';

describe.runIf(process.env.DB_TESTS === '1')('Chat (Postgres real)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let outsider: TestUser;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    owner = await signUp(app, 'dono');
    outsider = await signUp(app, 'intruso');
  });

  afterEach(async () => {
    await app.close();
  });

  async function createGuild(user = owner, name = 'Os Amigos') {
    const res = await http(app)
      .post('/api/guilds')
      .set(...user.auth)
      .send({ name })
      .expect(201);
    return guildWithChannelsSchema.parse(res.body);
  }

  /** Coloca alguém como membro comum direto no banco (convites só chegam na Fase 3). */
  async function addMember(guildId: string, user: TestUser) {
    await app.get(PrismaService).member.create({ data: { guildId, userId: user.id } });
  }

  async function sendMessage(channelId: string, content: string, user = owner) {
    const res = await http(app)
      .post(`/api/channels/${channelId}/messages`)
      .set(...user.auth)
      .send({ content })
      .expect(201);
    return messageSchema.parse(res.body);
  }

  describe('servidores', () => {
    it('cria o servidor com o canal #geral e o criador como dono', async () => {
      const guild = await createGuild();

      expect(guild).toMatchObject({ name: 'Os Amigos', ownerId: owner.id });
      expect(guild.channels.map((c) => c.name)).toEqual(['geral']);

      const member = await app.get(PrismaService).member.findUniqueOrThrow({
        where: { guildId_userId: { guildId: guild.id, userId: owner.id } },
      });
      expect(member.role).toBe('OWNER');
    });

    it('lista só os servidores de que o usuário participa', async () => {
      await createGuild(owner, 'Primeiro');
      await createGuild(owner, 'Segundo');
      await createGuild(outsider, 'Do intruso');

      const res = await http(app)
        .get('/api/guilds')
        .set(...owner.auth)
        .expect(200);

      expect(
        guildSchema
          .array()
          .parse(res.body)
          .map((g) => g.name),
      ).toEqual(['Primeiro', 'Segundo']);
    });

    it('desempata servidores com o mesmo joinedAt pela ordem de criação (id UUID v7)', async () => {
      const prisma = app.get(PrismaService);
      const sameMs = new Date('2026-10-28T12:00:00.000Z');
      const older = '01a18000-0000-7000-8000-000000000001';
      const newer = '01a18000-0000-7000-8000-000000000002';
      // Inseridos ao contrário, para a ordem física da tabela não ajudar.
      for (const [id, name] of [
        [newer, 'Mais novo'],
        [older, 'Mais antigo'],
      ] as const) {
        await prisma.guild.create({
          data: {
            id,
            name,
            ownerId: owner.id,
            members: { create: { userId: owner.id, role: 'OWNER', joinedAt: sameMs } },
          },
        });
      }

      const res = await http(app)
        .get('/api/guilds')
        .set(...owner.auth)
        .expect(200);

      expect(
        guildSchema
          .array()
          .parse(res.body)
          .map((g) => g.name),
      ).toEqual(['Mais antigo', 'Mais novo']);
    });

    it('quem não é membro recebe 404, igual a um servidor que não existe', async () => {
      const guild = await createGuild();

      const notMember = await http(app)
        .get(`/api/guilds/${guild.id}`)
        .set(...outsider.auth)
        .expect(404);
      const missing = await http(app)
        .get(`/api/guilds/${MISSING_ID}`)
        .set(...outsider.auth)
        .expect(404);

      expect(notMember.body).toEqual(missing.body);
    });

    it('id malformado na URL vira 400, não erro 500', async () => {
      await http(app)
        .get('/api/guilds/nao-e-uuid')
        .set(...owner.auth)
        .expect(400);
    });

    it('só o dono renomeia e apaga; membro comum recebe 403', async () => {
      const guild = await createGuild();
      const member = await signUp(app, 'membro');
      await addMember(guild.id, member);

      await http(app)
        .patch(`/api/guilds/${guild.id}`)
        .set(...member.auth)
        .send({ name: 'Hackeado' })
        .expect(403);
      await http(app)
        .delete(`/api/guilds/${guild.id}`)
        .set(...member.auth)
        .expect(403);

      const res = await http(app)
        .patch(`/api/guilds/${guild.id}`)
        .set(...owner.auth)
        .send({ name: '  Novo nome ' })
        .expect(200);
      expect(guildSchema.parse(res.body).name).toBe('Novo nome');
    });

    it('apagar o servidor apaga canais e mensagens junto', async () => {
      const guild = await createGuild();
      await sendMessage(guild.channels[0]!.id, 'oi');

      await http(app)
        .delete(`/api/guilds/${guild.id}`)
        .set(...owner.auth)
        .expect(204);

      const prisma = app.get(PrismaService);
      expect(await prisma.channel.count({ where: { guildId: guild.id } })).toBe(0);
      expect(await prisma.message.count()).toBe(0);
    });
  });

  describe('canais', () => {
    it('cria canais no fim da lista, com nome normalizado', async () => {
      const guild = await createGuild();

      const res = await http(app)
        .post(`/api/guilds/${guild.id}/channels`)
        .set(...owner.auth)
        .send({ name: 'Bate Papo' })
        .expect(201);

      expect(channelSchema.parse(res.body)).toMatchObject({ name: 'bate-papo', position: 1 });
    });

    it('membro comum não cria canal (403); quem é de fora nem vê (404)', async () => {
      const guild = await createGuild();
      const member = await signUp(app, 'membro');
      await addMember(guild.id, member);

      await http(app)
        .post(`/api/guilds/${guild.id}/channels`)
        .set(...member.auth)
        .send({ name: 'x' })
        .expect(403);
      await http(app)
        .post(`/api/guilds/${guild.id}/channels`)
        .set(...outsider.auth)
        .send({ name: 'x' })
        .expect(404);
    });

    it('não deixa apagar o último canal', async () => {
      const guild = await createGuild();

      const res = await http(app)
        .delete(`/api/channels/${guild.channels[0]!.id}`)
        .set(...owner.auth)
        .expect(409);

      expect(apiErrorSchema.parse(res.body).message).toBe(
        'O servidor precisa ter pelo menos um canal',
      );
    });
  });

  describe('mensagens', () => {
    it('envia e lista, com dados públicos do autor', async () => {
      const guild = await createGuild();
      const channelId = guild.channels[0]!.id;

      const sent = await sendMessage(channelId, '  oi, pessoal!  ');

      expect(sent).toMatchObject({
        content: 'oi, pessoal!',
        editedAt: null,
        author: { id: owner.id, username: 'dono', displayName: 'dono' },
      });
      expect(Object.keys(sent.author).sort()).toEqual(['displayName', 'id', 'username']);
    });

    it('devolve o nonce do cliente na resposta', async () => {
      const guild = await createGuild();

      const res = await http(app)
        .post(`/api/channels/${guild.channels[0]!.id}/messages`)
        .set(...owner.auth)
        .send({ content: 'oi', nonce: 'tmp-123' })
        .expect(201);

      expect(messageSchema.parse(res.body).nonce).toBe('tmp-123');
    });

    it('quem é de fora não lê nem escreve (404)', async () => {
      const guild = await createGuild();
      const channelId = guild.channels[0]!.id;

      await http(app)
        .get(`/api/channels/${channelId}/messages`)
        .set(...outsider.auth)
        .expect(404);
      await http(app)
        .post(`/api/channels/${channelId}/messages`)
        .set(...outsider.auth)
        .send({ content: 'oi' })
        .expect(404);
    });

    it('só o autor edita; a edição marca editedAt', async () => {
      const guild = await createGuild();
      const member = await signUp(app, 'membro');
      await addMember(guild.id, member);
      const sent = await sendMessage(guild.channels[0]!.id, 'original', member);

      await http(app)
        .patch(`/api/messages/${sent.id}`)
        .set(...owner.auth)
        .send({ content: 'mexi' })
        .expect(403);

      const res = await http(app)
        .patch(`/api/messages/${sent.id}`)
        .set(...member.auth)
        .send({ content: 'editada' })
        .expect(200);
      const edited = messageSchema.parse(res.body);
      expect(edited.content).toBe('editada');
      expect(edited.editedAt).not.toBeNull();
    });

    it('o autor e o dono do servidor apagam; outro membro não', async () => {
      const guild = await createGuild();
      const channelId = guild.channels[0]!.id;
      const alice = await signUp(app, 'alice');
      const bob = await signUp(app, 'bob');
      await addMember(guild.id, alice);
      await addMember(guild.id, bob);
      const fromAlice = await sendMessage(channelId, 'da alice', alice);
      const another = await sendMessage(channelId, 'outra da alice', alice);

      await http(app)
        .delete(`/api/messages/${fromAlice.id}`)
        .set(...bob.auth)
        .expect(403);
      await http(app)
        .delete(`/api/messages/${fromAlice.id}`)
        .set(...alice.auth)
        .expect(204);
      await http(app)
        .delete(`/api/messages/${another.id}`)
        .set(...owner.auth)
        .expect(204);
    });

    it('limita a 5 mensagens a cada 5 segundos por usuário', async () => {
      const guild = await createGuild();
      const channelId = guild.channels[0]!.id;
      const member = await signUp(app, 'membro');
      await addMember(guild.id, member);

      for (let i = 0; i < 5; i++) await sendMessage(channelId, `msg ${i}`);
      await http(app)
        .post(`/api/channels/${channelId}/messages`)
        .set(...owner.auth)
        .send({ content: 'uma a mais' })
        .expect(429);

      // O limite é por usuário, não global: o outro membro continua podendo falar.
      await sendMessage(channelId, 'oi', member);
    });
  });

  describe('paginação por cursor', () => {
    async function seed(channelId: string, total: number) {
      const prisma = app.get(PrismaService);
      for (let i = 0; i < total; i++) {
        await prisma.message.create({
          data: { channelId, authorId: owner.id, content: `msg ${i}` },
        });
      }
    }

    async function page(channelId: string, query: Record<string, string | number> = {}) {
      const res = await http(app)
        .get(`/api/channels/${channelId}/messages`)
        .query(query)
        .set(...owner.auth)
        .expect(200);
      return messagePageSchema.parse(res.body);
    }

    it('canal vazio: lista vazia e hasMore=false', async () => {
      const guild = await createGuild();

      expect(await page(guild.channels[0]!.id)).toEqual({ messages: [], hasMore: false });
    });

    it('exatamente o tamanho da página: hasMore=false', async () => {
      const guild = await createGuild();
      const channelId = guild.channels[0]!.id;
      await seed(channelId, 5);

      const result = await page(channelId, { limit: 5 });

      expect(result.messages).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });

    it('percorre o histórico inteiro sem repetir nem pular mensagens', async () => {
      const guild = await createGuild();
      const channelId = guild.channels[0]!.id;
      await seed(channelId, 23);

      const seen: MessageDto[] = [];
      let before: string | undefined;
      let pages = 0;
      for (;;) {
        const result = await page(channelId, { limit: 10, ...(before && { before }) });
        seen.push(...result.messages);
        pages++;
        if (!result.hasMore) break;
        before = result.messages.at(-1)!.id;
      }

      expect(pages).toBe(3); // 10 + 10 + 3
      const ids = seen.map((m) => m.id);
      expect(new Set(ids).size).toBe(23);
      // Contrato: da mais nova para a mais antiga, pelo id (UUID v7)
      expect(ids).toEqual([...ids].sort().reverse());
    });

    it('mensagem nova durante a paginação não desloca as páginas seguintes', async () => {
      const guild = await createGuild();
      const channelId = guild.channels[0]!.id;
      await seed(channelId, 6);

      const first = await page(channelId, { limit: 3 });
      await sendMessage(channelId, 'chegou agora');
      const second = await page(channelId, { limit: 3, before: first.messages.at(-1)!.id });

      const firstIds = first.messages.map((m) => m.id);
      expect(second.messages.some((m) => firstIds.includes(m.id))).toBe(false);
      expect(second.messages).toHaveLength(3);
      expect(second.hasMore).toBe(false);
    });

    it('valida os parâmetros da paginação', async () => {
      const guild = await createGuild();
      const channelId = guild.channels[0]!.id;

      await http(app)
        .get(`/api/channels/${channelId}/messages?limit=500`)
        .set(...owner.auth)
        .expect(400);
      await http(app)
        .get(`/api/channels/${channelId}/messages?before=xyz`)
        .set(...owner.auth)
        .expect(400);
    });
  });
});
