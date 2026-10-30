import { SYSTEM_AUDIO_MESSAGE } from '@discord-2/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { FakeParticipant, FakeRoom, FakeTrack, lastRoom, nextRoom, rooms } from '../test/fakeRoom';
import { authResponse, channel, guild, otherUser, server } from '../test/server';

vi.mock('./livekit', () => ({
  createRoom: () => {
    const room = new FakeRoom();
    room.localParticipant.identity = '0190f0b2-0000-7000-8000-000000000001';
    room.localParticipant.name = 'Guilherme';
    nextRoom.setup?.(room);
    nextRoom.setup = undefined;
    rooms.push(room);
    return room;
  },
  listAudioDevices: () => Promise.resolve([]),
}));

// Som do PC do app desktop: a parte de áudio de verdade (AudioWorklet) não
// existe no jsdom; aqui só importa o que o VoiceProvider faz com a faixa.
const systemAudio = vi.hoisted(() => ({
  track: { kind: 'audio', id: 'som-do-pc' },
  close: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../desktop/systemAudio', () => ({ createSystemAudio: systemAudio.create }));

const voice = channel({ id: 'v-1', name: 'papo', type: 'VOICE', position: 1 });

function withVoiceGuild() {
  const g = guild({ channels: [channel(), voice] });
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    http.get('/api/guilds', () => {
      const { channels: _c, ...summary } = g;
      return HttpResponse.json([summary]);
    }),
    http.get('/api/guilds/g-1', () => HttpResponse.json(g)),
    http.get('/api/channels/c-geral/messages', () =>
      HttpResponse.json({ messages: [], hasMore: false }),
    ),
    http.post('/api/channels/:id/voice-token', () =>
      HttpResponse.json({ url: 'ws://livekit.test', token: 'token' }),
    ),
  );
}

/** O jsdom não tem captura de tela; aqui fingimos que o navegador suporta. */
function supportScreenCapture(supported = true) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: supported ? { getDisplayMedia: vi.fn() } : {},
  });
}

async function joinVoice() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/channels/g-1/c-geral']}>
      <App />
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole('button', { name: 'Entrar no canal de voz papo' }));
  await within(await panel()).findByText('Voz conectada');
  return user;
}

const panel = () => screen.findByRole('region', { name: 'Voz' });
const grid = () => screen.findByRole('list', { name: 'Participantes' });

type ShareCall = [boolean, Record<string, unknown>, Record<string, Record<string, unknown>>];
const lastShareCall = () =>
  lastRoom().localParticipant.setScreenShareEnabled.mock.calls.at(-1) as unknown as ShareCall;

beforeEach(() => {
  rooms.length = 0;
  supportScreenCapture();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('transmitir a minha tela', () => {
  it('clicar no canal de voz abre a página dele, conectado e sem receber telas automaticamente', async () => {
    withVoiceGuild();
    await joinVoice();

    expect(screen.getByRole('heading', { name: 'papo' })).toBeInTheDocument();
    expect(lastRoom().connect).toHaveBeenCalledWith('ws://livekit.test', 'token', {
      autoSubscribe: false,
    });
  });

  it('"Vídeo/jogo" vem selecionado e envia 1080p a 30 fps com áudio', async () => {
    withVoiceGuild();
    const user = await joinVoice();

    await user.click(within(await panel()).getByRole('button', { name: 'Compartilhar tela' }));
    expect(screen.getByRole('radio', { name: /Vídeo\/jogo/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Escolher tela' }));

    const [enabled, capture, publish] = lastShareCall();
    expect(enabled).toBe(true);
    expect(capture).toMatchObject({
      audio: true,
      contentHint: 'motion',
      resolution: { width: 1920, height: 1080, frameRate: 30 },
    });
    expect(publish.screenShareEncoding).toMatchObject({ maxFramerate: 30 });
  });

  it('"Texto/código" prioriza nitidez (detail, 15 fps)', async () => {
    withVoiceGuild();
    const user = await joinVoice();

    await user.click(within(await panel()).getByRole('button', { name: 'Compartilhar tela' }));
    await user.click(screen.getByRole('radio', { name: /Texto\/código/ }));
    await user.click(screen.getByRole('button', { name: 'Escolher tela' }));

    const [, capture, publish] = lastShareCall();
    expect(capture.contentHint).toBe('detail');
    expect(publish.screenShareEncoding).toMatchObject({ maxFramerate: 15 });
  });

  it('mostra que estou transmitindo (com miniatura) e para pelo botão', async () => {
    withVoiceGuild();
    const user = await joinVoice();
    const room = lastRoom();
    await user.click(within(await panel()).getByRole('button', { name: 'Compartilhar tela' }));
    await user.click(screen.getByRole('button', { name: 'Escolher tela' }));

    room.fire('localTrackPublished', { source: 'screen_share', track: new FakeTrack('video') });

    expect(await within(await panel()).findByText(/Você está transmitindo/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Sua transmissão')).toBeInTheDocument();
    const me = (await screen.findByText(/\(você\)/)).closest('li')!;
    expect(within(me).getByText('🔴 AO VIVO')).toBeInTheDocument();

    await user.click(
      within(await panel()).getByRole('button', { name: 'Parar de compartilhar a tela' }),
    );
    expect(lastShareCall()[0]).toBe(false);
  });

  it('parar pela barra do próprio navegador também atualiza a tela', async () => {
    withVoiceGuild();
    await joinVoice();
    const room = lastRoom();
    const pub = { source: 'screen_share', track: new FakeTrack('video') };
    room.fire('localTrackPublished', pub);
    await within(await panel()).findByText(/Você está transmitindo/);

    room.fire('localTrackUnpublished', pub);

    await waitFor(() =>
      expect(screen.queryByText(/Você está transmitindo/)).not.toBeInTheDocument(),
    );
    expect(
      within(await panel()).getByRole('button', { name: 'Compartilhar tela' }),
    ).toBeInTheDocument();
  });

  it('fechar o seletor do navegador sem escolher não mostra erro', async () => {
    withVoiceGuild();
    nextRoom.setup = (room) => {
      room.localParticipant.shareError = Object.assign(new Error('cancelado'), {
        name: 'NotAllowedError',
      });
    };
    const user = await joinVoice();

    await user.click(within(await panel()).getByRole('button', { name: 'Compartilhar tela' }));
    await user.click(screen.getByRole('button', { name: 'Escolher tela' }));

    expect(within(await panel()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('navegador sem suporte: avisa', async () => {
    withVoiceGuild();
    supportScreenCapture(false);
    const user = await joinVoice();

    await user.click(within(await panel()).getByRole('button', { name: 'Compartilhar tela' }));
    await user.click(screen.getByRole('button', { name: 'Escolher tela' }));

    expect(await within(await panel()).findByRole('alert')).toHaveTextContent(
      'Este navegador não permite compartilhar a tela.',
    );
  });
});

describe('assistir a tela de alguém', () => {
  it('a tela de quem transmite só chega depois de clicar em "Assistir"', async () => {
    withVoiceGuild();
    const user = await joinVoice();
    const room = lastRoom();
    const ana = new FakeParticipant(otherUser.id, 'Ana').withAudio();
    room.addRemote(ana);
    room.fire('trackPublished', ana.publication('microphone'), ana);

    room.startRemoteScreen(ana);

    // A voz dela eu recebo; a tela, ainda não.
    expect(ana.publication('microphone')!.subscribed).toBe(true);
    expect(ana.publication('screen_share')!.subscribed).toBe(false);
    expect(ana.publication('screen_share_audio')!.subscribed).toBe(false);
    const card = (await within(await grid()).findByText('Ana')).closest('li')!;
    expect(within(card).getByText('🔴 AO VIVO')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Assistir Ana' }));

    expect(ana.publication('screen_share')!.subscribed).toBe(true);
    expect(ana.publication('screen_share_audio')!.subscribed).toBe(true);
    room.deliver(ana, 'screen_share');
    expect(await screen.findByLabelText('Transmissão de Ana')).toBeInTheDocument();
  });

  it('parar de assistir corta o recebimento e fecha a tela grande', async () => {
    withVoiceGuild();
    const user = await joinVoice();
    const room = lastRoom();
    const ana = new FakeParticipant(otherUser.id, 'Ana');
    room.addRemote(ana);
    room.startRemoteScreen(ana);
    await user.click(await screen.findByRole('button', { name: 'Assistir Ana' }));
    room.deliver(ana, 'screen_share');
    await screen.findByLabelText('Transmissão de Ana');

    await user.click(screen.getByRole('button', { name: 'Parar de assistir' }));

    expect(ana.publication('screen_share')!.subscribed).toBe(false);
    expect(screen.queryByLabelText('Transmissão de Ana')).not.toBeInTheDocument();
  });

  it('se a pessoa para de transmitir, a tela grande fecha sozinha', async () => {
    withVoiceGuild();
    const user = await joinVoice();
    const room = lastRoom();
    const ana = new FakeParticipant(otherUser.id, 'Ana');
    room.addRemote(ana);
    room.startRemoteScreen(ana);
    await user.click(await screen.findByRole('button', { name: 'Assistir Ana' }));
    room.deliver(ana, 'screen_share');
    await screen.findByLabelText('Transmissão de Ana');

    const screenPub = ana.publication('screen_share')!;
    ana.trackPublications.delete('screen');
    room.fire('trackUnpublished', screenPub, ana);

    await waitFor(() =>
      expect(screen.queryByLabelText('Transmissão de Ana')).not.toBeInTheDocument(),
    );
  });

  it('o botão de tela cheia pede tela cheia ao navegador', async () => {
    withVoiceGuild();
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    const user = await joinVoice();
    const room = lastRoom();
    const ana = new FakeParticipant(otherUser.id, 'Ana');
    room.addRemote(ana);
    room.startRemoteScreen(ana);
    await user.click(await screen.findByRole('button', { name: 'Assistir Ana' }));

    await user.click(screen.getByRole('button', { name: 'Tela cheia' }));

    expect(requestFullscreen).toHaveBeenCalled();
  });
});

describe('som do PC (app desktop)', () => {
  /** O app desktop entrega o canal do som do PC, como o preload faz. */
  function deliverSystemAudio() {
    const port = { close: vi.fn() };
    const event = new MessageEvent('message', {
      data: { type: SYSTEM_AUDIO_MESSAGE },
      origin: window.location.origin,
    });
    Object.defineProperty(event, 'source', { value: window });
    Object.defineProperty(event, 'ports', { value: [port] });
    act(() => {
      window.dispatchEvent(event);
    });
    return port;
  }

  beforeEach(() => {
    systemAudio.close.mockReset();
    systemAudio.create.mockReset();
    systemAudio.create.mockResolvedValue({ track: systemAudio.track, close: systemAudio.close });
  });

  it('no app, a captura não pede o áudio do Chromium (levaria as vozes: eco)', async () => {
    (window as Window & { desktop?: unknown }).desktop = {
      platform: 'win32',
      onScreenPickerRequest: () => () => undefined,
      respondScreenPicker: vi.fn(),
    };
    try {
      withVoiceGuild();
      const user = await joinVoice();

      await user.click(within(await panel()).getByRole('button', { name: 'Compartilhar tela' }));
      await user.click(screen.getByRole('button', { name: 'Escolher tela' }));

      expect(lastShareCall()[1]).toMatchObject({ audio: false, systemAudio: 'exclude' });
    } finally {
      Reflect.deleteProperty(window, 'desktop');
    }
  });

  it('vira o áudio da tela na transmissão', async () => {
    withVoiceGuild();
    await joinVoice();
    const local = lastRoom().localParticipant;

    const port = deliverSystemAudio();

    await waitFor(() => expect(local.publishTrack).toHaveBeenCalled());
    expect(systemAudio.create).toHaveBeenCalledWith(port);
    expect(local.publishTrack).toHaveBeenCalledWith(
      systemAudio.track,
      expect.objectContaining({ source: 'screen_share_audio', forceStereo: true }),
    );
  });

  it('parar a transmissão tira o som do PC e desliga a captura', async () => {
    withVoiceGuild();
    await joinVoice();
    const room = lastRoom();
    const pub = { source: 'screen_share', track: new FakeTrack('video') };
    room.fire('localTrackPublished', pub);
    deliverSystemAudio();
    await waitFor(() => expect(room.localParticipant.publishTrack).toHaveBeenCalled());

    room.fire('localTrackUnpublished', pub);

    await waitFor(() => expect(systemAudio.close).toHaveBeenCalledOnce());
    expect(room.localParticipant.unpublishTrack).toHaveBeenCalledWith(systemAudio.track);
  });

  it('sair da voz também desliga a captura', async () => {
    withVoiceGuild();
    const user = await joinVoice();
    deliverSystemAudio();
    await waitFor(() => expect(lastRoom().localParticipant.publishTrack).toHaveBeenCalled());

    await user.click(within(await panel()).getByRole('button', { name: 'Sair da voz' }));

    expect(systemAudio.close).toHaveBeenCalledOnce();
  });

  it('fora da voz, fecha o canal sem capturar', async () => {
    withVoiceGuild();
    render(
      <MemoryRouter initialEntries={['/channels/g-1/c-geral']}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Entrar no canal de voz papo' });

    const port = deliverSystemAudio();

    await waitFor(() => expect(port.close).toHaveBeenCalled());
    expect(systemAudio.create).not.toHaveBeenCalled();
  });

  it('se o áudio falhar, avisa (a imagem continua)', async () => {
    withVoiceGuild();
    await joinVoice();
    systemAudio.create.mockRejectedValue(new Error('sem AudioWorklet'));

    deliverSystemAudio();

    expect(
      await within(await panel()).findByText('Não foi possível transmitir o som do PC.'),
    ).toBeInTheDocument();
  });
});
