import { describe, expect, it } from 'vitest';
import {
  channelNameSchema,
  createChannelSchema,
  createMessageSchema,
  guildNameSchema,
  messagePageQuerySchema,
} from './chat.js';

describe('channelNameSchema', () => {
  it.each([
    ['Geral', 'geral'],
    ['  Bate Papo  ', 'bate-papo'],
    ['jogos   de   hoje', 'jogos-de-hoje'],
    ['música_2', 'música_2'],
  ])('normaliza %j para %j', (input, expected) => {
    expect(channelNameSchema.parse(input)).toBe(expected);
  });

  it.each([
    ['', 'Dê um nome ao canal'],
    ['   ', 'Dê um nome ao canal'],
    ['canal!', 'Use só letras, números, "-" e "_"'],
    ['x'.repeat(101), 'O nome pode ter no máximo 100 caracteres'],
  ])('rejeita %j', (input, message) => {
    const result = channelNameSchema.safeParse(input);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});

describe('createChannelSchema', () => {
  it('é de texto por padrão e aceita voz', () => {
    expect(createChannelSchema.parse({ name: 'geral' }).type).toBe('TEXT');
    expect(createChannelSchema.parse({ name: 'papo', type: 'VOICE' }).type).toBe('VOICE');
  });

  it('não deixa criar DM pelo endpoint de canal', () => {
    expect(createChannelSchema.safeParse({ name: 'x', type: 'DM' }).success).toBe(false);
  });
});

describe('guildNameSchema', () => {
  it('aceita espaços e maiúsculas, só tira as bordas', () => {
    expect(guildNameSchema.parse('  Os Amigos do Gui  ')).toBe('Os Amigos do Gui');
  });
});

describe('createMessageSchema', () => {
  it('tira espaços das bordas mas mantém quebras de linha internas', () => {
    expect(createMessageSchema.parse({ content: '  oi\ntudo bem?  ' }).content).toBe(
      'oi\ntudo bem?',
    );
  });

  it('rejeita mensagem só com espaços', () => {
    expect(createMessageSchema.safeParse({ content: '   \n ' }).success).toBe(false);
  });

  it('aceita exatamente 2000 caracteres e recusa 2001', () => {
    expect(createMessageSchema.safeParse({ content: 'a'.repeat(2000) }).success).toBe(true);
    expect(createMessageSchema.safeParse({ content: 'a'.repeat(2001) }).success).toBe(false);
  });
});

describe('messagePageQuerySchema', () => {
  it('converte limit da query string e usa 50 como padrão', () => {
    expect(messagePageQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(messagePageQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
  });

  it('limita a 100 por página e exige cursor em formato UUID', () => {
    expect(messagePageQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(messagePageQuerySchema.safeParse({ before: 'abc' }).success).toBe(false);
  });
});
