import { describe, expect, it } from 'vitest';
import { message } from '../test/server';
import {
  type ChatMessage,
  markMessageFailed,
  type MessagesData,
  removeChannel,
  removeMessage,
  upsertChannel,
  upsertMessage,
} from './cache';

function data(...pages: ChatMessage[][]): MessagesData {
  return {
    pages: pages.map((messages, i) => ({ messages, hasMore: i < pages.length - 1 })),
    pageParams: pages.map((_, i) => (i === 0 ? undefined : `cursor-${i}`)),
  };
}

const ids = (d: MessagesData | undefined) => d?.pages.flatMap((p) => p.messages.map((m) => m.id));

describe('upsertMessage', () => {
  it('mensagem nova entra no topo da primeira página (é a mais recente)', () => {
    const older = message();
    const fresh = message();

    expect(ids(upsertMessage(data([older]), fresh))).toEqual([fresh.id, older.id]);
  });

  it('não duplica se a mesma mensagem chegar duas vezes (API e socket)', () => {
    const msg = message();
    const once = upsertMessage(data([]), msg);

    expect(ids(upsertMessage(once, { ...msg, content: 'atualizada' }))).toEqual([msg.id]);
  });

  it('troca a mensagem pendente pela real quando o nonce bate', () => {
    const pending: ChatMessage = { ...message({ id: 'nonce-1' }), status: 'pending' };
    const real = message({ id: 'real-1', nonce: 'nonce-1' });

    const result = upsertMessage(data([pending, message()]), real);

    expect(ids(result)?.[0]).toBe('real-1');
    expect(result?.pages[0]?.messages[0]?.status).toBeUndefined();
    expect(ids(result)).not.toContain('nonce-1');
  });

  it('acha a mensagem em qualquer página, não só na primeira', () => {
    const old = message();
    const result = upsertMessage(data([message()], [old]), { ...old, content: 'editada' });

    expect(result?.pages[1]?.messages[0]?.content).toBe('editada');
  });

  it('sem cache carregado, não cria nada (o canal será buscado ao abrir)', () => {
    expect(upsertMessage(undefined, message())).toBeUndefined();
  });
});

describe('removeMessage / markMessageFailed', () => {
  it('remove de qualquer página', () => {
    const a = message();
    const b = message();

    expect(ids(removeMessage(data([a], [b]), b.id))).toEqual([a.id]);
  });

  it('marca só a mensagem certa como falha', () => {
    const pending: ChatMessage = { ...message({ id: 'tmp' }), status: 'pending' };
    const other = message();

    const result = markMessageFailed(data([pending, other]), 'tmp');

    expect(result?.pages[0]?.messages.map((m) => m.status)).toEqual(['failed', undefined]);
  });
});

describe('canais', () => {
  const base = {
    id: 'g',
    name: 'G',
    ownerId: 'u',
    createdAt: '2026-01-01T00:00:00.000Z',
    channels: [
      { id: 'a', guildId: 'g', name: 'a', type: 'TEXT' as const, position: 0, createdAt: '' },
      { id: 'c', guildId: 'g', name: 'c', type: 'TEXT' as const, position: 2, createdAt: '' },
    ],
  };

  it('insere na posição certa e atualiza sem duplicar', () => {
    const b = {
      id: 'b',
      guildId: 'g',
      name: 'b',
      type: 'TEXT' as const,
      position: 1,
      createdAt: '',
    };

    const inserted = upsertChannel(base, b);
    const renamed = upsertChannel(inserted, { ...b, name: 'bê' });

    expect(renamed?.channels.map((c) => c.name)).toEqual(['a', 'bê', 'c']);
  });

  it('remove o canal', () => {
    expect(removeChannel(base, 'a')?.channels.map((c) => c.id)).toEqual(['c']);
  });
});
