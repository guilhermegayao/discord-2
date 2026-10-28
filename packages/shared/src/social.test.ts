import { describe, expect, it } from 'vitest';
import { createInviteSchema, openDmSchema, typingStartSchema } from './chat.js';

describe('createInviteSchema', () => {
  it('usa 7 dias como padrão', () => {
    expect(createInviteSchema.parse({})).toEqual({ expiresIn: '7d' });
  });

  it('aceita só as validades conhecidas', () => {
    expect(createInviteSchema.safeParse({ expiresIn: 'never' }).success).toBe(true);
    expect(createInviteSchema.safeParse({ expiresIn: '30d' }).success).toBe(false);
  });
});

describe('ids em eventos e DMs', () => {
  it('exige UUID para abrir DM e para o evento de digitando', () => {
    expect(openDmSchema.safeParse({ userId: 'abc' }).success).toBe(false);
    expect(typingStartSchema.safeParse({ channelId: 'abc' }).success).toBe(false);
    expect(
      typingStartSchema.safeParse({ channelId: '01a18165-b4e3-7299-89a8-f62ad91dd3e3' }).success,
    ).toBe(true);
  });
});
