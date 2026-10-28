import type { ChannelDto } from '@discord-2/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { fakeSocket } from '../test/fakeSocket';
import { FakeParticipant, FakeRoom, lastRoom, nextRoom, rooms } from '../test/fakeRoom';
import { authResponse, channel, guild, otherUser, server } from '../test/server';

// O app cria a sala por este módulo; nos testes, ele devolve salas falsas.
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
  listAudioDevices: (kind: string) =>
    Promise.resolve([{ deviceId: `${kind}-1`, label: `Dispositivo ${kind}` }]),
}));

const voiceA = channel({ id: 'v-1', name: 'papo', type: 'VOICE', position: 1 });
const voiceB = channel({ id: 'v-2', name: 'jogos', type: 'VOICE', position: 2 });

function withVoiceGuild() {
  const g = guild({ channels: [channel(), voiceA, voiceB] });
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
    http.post('/api/channels/:id/voice-token', ({ params }) =>
      HttpResponse.json({ url: 'ws://livekit.test', token: `token-${params.id as string}` }),
    ),
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/channels/g-1/c-geral']}>
      <App />
    </MemoryRouter>,
  );
}

const panel = () => screen.findByRole('region', { name: 'Voz' });
const peopleIn = (name: string) => screen.findByRole('list', { name: `Na voz em ${name}` });

async function joinPapo() {
  const user = userEvent.setup();
  renderApp();
  await user.click(await screen.findByRole('button', { name: 'Entrar no canal de voz papo' }));
  await within(await panel()).findByText('Voz conectada');
  return user;
}

beforeEach(() => {
  rooms.length = 0;
});

describe('lista de canais de voz', () => {
  it('mostra quem está em cada canal e atualiza com voice:state', async () => {
    withVoiceGuild();
    server.use(
      http.get('/api/guilds/g-1/voice-states', () =>
        HttpResponse.json([{ channelId: 'v-1', participants: [otherUser] }]),
      ),
    );
    renderApp();

    expect(await within(await peopleIn('papo')).findByText('Ana')).toBeInTheDocument();

    fakeSocket.serverEmit('voice:state', {
      guildId: 'g-1',
      channelId: 'v-1',
      participants: [otherUser, { ...otherUser, id: 'u-3', displayName: 'Bia' }],
    });
    expect(await within(await peopleIn('papo')).findByText('Bia')).toBeInTheDocument();

    fakeSocket.serverEmit('voice:state', { guildId: 'g-1', channelId: 'v-1', participants: [] });
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Na voz em papo' })).not.toBeInTheDocument(),
    );
  });

  it('canal de voz não aparece entre os de texto', async () => {
    withVoiceGuild();
    renderApp();

    const textNav = await screen.findByRole('navigation', { name: 'Canais' });
    expect(within(textNav).queryByText('papo')).not.toBeInTheDocument();
    expect(await screen.findByRole('navigation', { name: 'Canais de voz' })).toHaveTextContent(
      'papo',
    );
  });
});

describe('entrar e sair da voz', () => {
  it('pede o token, conecta no LiveKit e liga o microfone', async () => {
    withVoiceGuild();
    await joinPapo();

    const room = lastRoom();
    expect(room.connect).toHaveBeenCalledWith('ws://livekit.test', 'token-v-1');
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(within(await peopleIn('papo')).getByText('Guilherme')).toBeInTheDocument();
  });

  it('mostra quem entra e quem está falando', async () => {
    withVoiceGuild();
    await joinPapo();
    const room = lastRoom();
    const ana = new FakeParticipant(otherUser.id, 'Ana');

    room.addRemote(ana);
    const ana$ = await within(await peopleIn('papo')).findByText('Ana');

    room.fire('activeSpeakersChanged', [ana]);
    await waitFor(() =>
      expect(ana$.closest('li')!.querySelector('.avatar--speaking')).not.toBeNull(),
    );
    expect(within(ana$.closest('li')!).getByText('(falando)')).toBeInTheDocument();

    room.fire('activeSpeakersChanged', []);
    await waitFor(() => expect(ana$.closest('li')!.querySelector('.avatar--speaking')).toBeNull());
  });

  it('mutar e desmutar o microfone', async () => {
    withVoiceGuild();
    const user = await joinPapo();
    const room = lastRoom();
    const micButton = within(await panel()).getByRole('button', { name: 'Microfone' });

    await user.click(micButton);

    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(micButton).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(await peopleIn('papo')).getByRole('img', { name: 'microfone desligado' }),
    ).toBeInTheDocument();

    await user.click(micButton);
    expect(micButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('ensurdecer silencia todo mundo e muta o microfone; voltar restaura os dois', async () => {
    withVoiceGuild();
    const user = await joinPapo();
    const room = lastRoom();
    const ana = new FakeParticipant(otherUser.id, 'Ana').withAudio();
    room.addRemote(ana);
    const deafen = within(await panel()).getByRole('button', { name: 'Ensurdecer' });

    await user.click(deafen);
    expect(ana.volumes.at(-1)).toBe(0);
    expect(room.localParticipant.isMicrophoneEnabled).toBe(false);

    await user.click(deafen);
    expect(ana.volumes.at(-1)).toBe(1);
    expect(room.localParticipant.isMicrophoneEnabled).toBe(true);
  });

  it('sair desconecta da sala e some o painel', async () => {
    withVoiceGuild();
    const user = await joinPapo();
    const room = lastRoom();

    await user.click(within(await panel()).getByRole('button', { name: 'Sair da voz' }));

    expect(room.disconnect).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Voz' })).not.toBeInTheDocument(),
    );
  });

  it('entrar em outro canal sai do anterior antes', async () => {
    withVoiceGuild();
    const user = await joinPapo();
    const first = lastRoom();

    await user.click(screen.getByRole('button', { name: 'Entrar no canal de voz jogos' }));
    await within(await panel()).findByText('🔊 jogos');

    expect(first.disconnect).toHaveBeenCalled();
    expect(lastRoom()).not.toBe(first);
    expect(lastRoom().connect).toHaveBeenCalledWith('ws://livekit.test', 'token-v-2');
  });
});

describe('problemas', () => {
  it('microfone bloqueado: conecta para ouvir e explica o que fazer', async () => {
    withVoiceGuild();
    const user = userEvent.setup();
    nextRoom.setup = (room) => {
      room.localParticipant.micError = Object.assign(new Error('Permission denied'), {
        name: 'NotAllowedError',
      });
    };
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Entrar no canal de voz papo' }));

    const p = await panel();
    expect(await within(p).findByText('Voz conectada')).toBeInTheDocument();
    expect(within(p).getByRole('alert')).toHaveTextContent('O navegador bloqueou o microfone');
  });

  it('entrou em outra aba: avisa e desconecta', async () => {
    withVoiceGuild();
    await joinPapo();
    const { DisconnectReason } = await import('livekit-client');

    lastRoom().fire('disconnected', DisconnectReason.DUPLICATE_IDENTITY);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você entrou na voz em outra aba ou dispositivo.',
    );
    expect(screen.queryByText('Voz conectada')).not.toBeInTheDocument();
  });

  it('servidor de voz fora do ar: mensagem clara', async () => {
    withVoiceGuild();
    const user = userEvent.setup();
    renderApp();
    const button = await screen.findByRole('button', { name: 'Entrar no canal de voz papo' });
    nextRoom.setup = (room) => {
      room.connect.mockRejectedValueOnce(new Error('could not connect'));
    };

    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível entrar no canal de voz',
    );
  });
});

describe('criar canal de voz', () => {
  it('envia o tipo VOICE e não navega para ele', async () => {
    withVoiceGuild();
    const user = userEvent.setup();
    let sent: unknown;
    server.use(
      http.post('/api/guilds/g-1/channels', async ({ request }) => {
        sent = await request.json();
        const created: ChannelDto = channel({
          id: 'v-9',
          name: 'sala-nova',
          type: 'VOICE',
          position: 3,
        });
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Criar canal' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByLabelText(/Voz/));
    await user.type(dialog.getByLabelText('Nome do canal'), 'Sala Nova');
    await user.click(dialog.getByRole('button', { name: 'Criar canal' }));

    await waitFor(() => expect(sent).toEqual({ name: 'sala-nova', type: 'VOICE' }));
    expect(
      await screen.findByRole('button', { name: 'Entrar no canal de voz sala-nova' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'geral' })).toBeInTheDocument();
  });
});
