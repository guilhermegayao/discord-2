import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CapturerSourceLike, PickerBroker, toPickerSources } from './picker.js';

function image(data: string | null) {
  return { toDataURL: () => data ?? '', isEmpty: () => data === null };
}

function source(
  id: string,
  name: string,
  thumb: string | null = 'thumb',
  icon: string | null = null,
): CapturerSourceLike {
  return { id, name, thumbnail: image(thumb), appIcon: icon === null ? null : image(icon) };
}

describe('toPickerSources', () => {
  it('telas primeiro, sem a própria janela do app e sem janelas sem nome', () => {
    const result = toPickerSources(
      [
        source('window:1:0', 'Jogo', 'thumb-jogo', 'icone-jogo'),
        source('window:2:0', 'discord-2'),
        source('screen:0:0', 'Tela 1'),
        source('window:4:0', '  '),
      ],
      'window:2:0',
    );

    expect(result.map((s) => [s.kind, s.name])).toEqual([
      ['screen', 'Tela 1'],
      ['window', 'Jogo'],
    ]);
    expect(result[1]).toMatchObject({ thumbnail: 'thumb-jogo', appIcon: 'icone-jogo' });
  });

  it('mantém janelas sem prévia (jogo minimizado ou em tela cheia), no fim da lista', () => {
    const result = toPickerSources(
      [
        source('window:3:0', 'Jogo em tela cheia', null, 'icone-jogo'),
        source('window:1:0', 'Bloco de Notas'),
        source('screen:0:0', 'Tela 1'),
      ],
      null,
    );

    expect(result.map((s) => s.name)).toEqual(['Tela 1', 'Bloco de Notas', 'Jogo em tela cheia']);
    expect(result[2]).toMatchObject({ thumbnail: null, appIcon: 'icone-jogo' });
  });
});

describe('PickerBroker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const sources = toPickerSources(
    [source('screen:0:0', 'Tela'), source('window:1:0', 'Jogo')],
    null,
  );

  it('entrega o pedido à página e resolve com a escolha', async () => {
    const broker = new PickerBroker();
    let sentId = '';
    const choice = broker.request(sources, (id) => (sentId = id));

    broker.respond(sentId, 'window:1:0', true);

    await expect(choice).resolves.toEqual({ sourceId: 'window:1:0', includeAudio: true });
  });

  it('cancelar (null) resolve com null', async () => {
    const broker = new PickerBroker();
    let sentId = '';
    const choice = broker.request(sources, (id) => (sentId = id));

    broker.respond(sentId, null);

    await expect(choice).resolves.toBeNull();
  });

  it('recusa um id que não estava na lista oferecida', async () => {
    const broker = new PickerBroker();
    let sentId = '';
    const choice = broker.request(sources, (id) => (sentId = id));

    broker.respond(sentId, 'screen:99:0');

    await expect(choice).resolves.toBeNull();
  });

  it('ignora resposta de pedido desconhecido ou repetida', async () => {
    const broker = new PickerBroker();
    let sentId = '';
    const choice = broker.request(sources, (id) => (sentId = id));

    broker.respond('pick-inexistente', 'screen:0:0');
    broker.respond(sentId, 'screen:0:0');
    broker.respond(sentId, 'window:1:0');

    await expect(choice).resolves.toEqual({ sourceId: 'screen:0:0', includeAudio: false });
  });

  it('desiste sozinho depois do tempo limite', async () => {
    vi.useFakeTimers();
    const broker = new PickerBroker(1000);
    const choice = broker.request(sources, () => undefined);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(choice).resolves.toBeNull();
  });

  it('cancelAll fecha todos os pedidos (janela fechada)', async () => {
    const broker = new PickerBroker();
    const a = broker.request(sources, () => undefined);
    const b = broker.request(sources, () => undefined);

    broker.cancelAll();

    await expect(Promise.all([a, b])).resolves.toEqual([null, null]);
  });
});
