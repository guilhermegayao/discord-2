import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ChatAccessService } from './chat-access.service.js';

function setup({ member, channel }: { member?: unknown; channel?: unknown }) {
  const prisma = {
    member: { findUnique: vi.fn().mockResolvedValue(member ?? null) },
    channel: { findUnique: vi.fn().mockResolvedValue(channel ?? null) },
  };
  return new ChatAccessService(prisma as unknown as PrismaService);
}

const base = {
  id: 'c1',
  name: 'geral',
  position: 0,
  dmKey: null,
  createdAt: new Date(),
};

const guildChannel = (roles: string[]) => ({
  ...base,
  type: 'TEXT',
  guildId: 'g1',
  guild: { members: roles.map((role) => ({ role })) },
  participants: [],
});

const dmChannel = (participantIds: string[]) => ({
  ...base,
  type: 'DM',
  guildId: null,
  dmKey: participantIds.join(':'),
  guild: null,
  participants: participantIds.map((userId) => ({ userId })),
});

describe('ChatAccessService', () => {
  it('requireMember: não membro recebe 404', async () => {
    await expect(setup({}).requireMember('g1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requireOwner: membro comum recebe 403; dono passa', async () => {
    await expect(
      setup({ member: { role: 'MEMBER' } }).requireOwner('g1', 'u1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup({ member: { role: 'OWNER' } }).requireOwner('g1', 'u1')).resolves.toBe(
      undefined,
    );
  });

  describe('requireChannel', () => {
    it('canal de servidor: não membro recebe 404', async () => {
      await expect(
        setup({ channel: guildChannel([]) }).requireChannel('c1', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('canal de servidor: devolve o canal (sem dados extras) e o papel', async () => {
      const access = await setup({ channel: guildChannel(['OWNER']) }).requireChannel('c1', 'u1');

      expect(access.kind).toBe('guild');
      if (access.kind !== 'guild') return;
      expect(access.role).toBe('OWNER');
      expect(access.channel).not.toHaveProperty('guild');
      expect(access.channel).not.toHaveProperty('participants');
      expect(ChatAccessService.audience(access)).toEqual({ guildId: 'g1' });
    });

    it('DM: participante acessa e o público dos eventos são os dois participantes', async () => {
      const access = await setup({ channel: dmChannel(['u1', 'u2']) }).requireChannel('c1', 'u1');

      expect(access.kind).toBe('dm');
      expect(ChatAccessService.audience(access)).toEqual({ userIds: ['u1', 'u2'] });
    });

    it('DM: terceiro recebe 404', async () => {
      await expect(
        setup({ channel: dmChannel(['u1', 'u2']) }).requireChannel('c1', 'u3'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('requireGuildChannel: DM não conta como canal de servidor (404)', async () => {
    await expect(
      setup({ channel: dmChannel(['u1', 'u2']) }).requireGuildChannel('c1', 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
