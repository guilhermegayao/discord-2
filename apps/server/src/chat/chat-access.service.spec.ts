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

const channelRow = (roles: string[]) => ({
  id: 'c1',
  guildId: 'g1',
  name: 'geral',
  type: 'TEXT',
  position: 0,
  createdAt: new Date(),
  guild: { members: roles.map((role) => ({ role })) },
});

describe('ChatAccessService', () => {
  it('requireMember: não membro recebe 404', async () => {
    await expect(setup({}).requireMember('g1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requireMember: devolve o papel do membro', async () => {
    await expect(setup({ member: { role: 'MEMBER' } }).requireMember('g1', 'u1')).resolves.toBe(
      'MEMBER',
    );
  });

  it('requireOwner: membro comum recebe 403', async () => {
    await expect(
      setup({ member: { role: 'MEMBER' } }).requireOwner('g1', 'u1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requireOwner: dono passa', async () => {
    await expect(setup({ member: { role: 'OWNER' } }).requireOwner('g1', 'u1')).resolves.toBe(
      undefined,
    );
  });

  it('requireChannel: canal existe mas o usuário não é membro → 404', async () => {
    await expect(
      setup({ channel: channelRow([]) }).requireChannel('c1', 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requireChannel: devolve o canal sem os dados do servidor e o papel', async () => {
    const result = await setup({ channel: channelRow(['OWNER']) }).requireChannel('c1', 'u1');

    expect(result.role).toBe('OWNER');
    expect(result.channel).not.toHaveProperty('guild');
    expect(result.channel.guildId).toBe('g1');
  });
});
