import type { MessageDto } from '@discord-2/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { fakeSocket } from '../test/fakeSocket';
import { authResponse, channel, guild, message, notFound, otherUser, server } from '../test/server';

const CHANNEL_URL = '/channels/g-1/c-geral';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** Logado, com um servidor "Os Amigos" e o canal #geral com estas mensagens. */
function withGuild(messages: MessageDto[] = [], hasMore = false) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    http.get('/api/guilds', () => {
      const { channels: _c, ...summary } = guild();
      return HttpResponse.json([summary]);
    }),
    http.get('/api/guilds/g-1', () => HttpResponse.json(guild())),
    http.get('/api/channels/c-geral/messages', () =>
      // A API devolve da mais nova para a mais antiga
      HttpResponse.json({ messages: messages.toReversed(), hasMore }),
    ),
  );
}

const messageList = () => screen.findByRole('list', { name: 'Mensagens em #geral' });
const contents = () =>
  screen.getByRole('list', { name: 'Mensagens em #geral' }).querySelectorAll('.message__content');
const texts = () => [...contents()].map((el) => el.textContent);

describe('navegação', () => {
  it('/channels abre o primeiro canal do primeiro servidor', async () => {
    withGuild();

    renderApp('/channels');

    expect(await screen.findByRole('heading', { name: 'geral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Os Amigos' })).toBeInTheDocument();
  });

  it('criar servidor leva direto para o #geral dele', async () => {
    const user = userEvent.setup();
    // A API falsa "lembra" o servidor criado, como a real faria.
    let created: ReturnType<typeof guild> | undefined;
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      http.get('/api/guilds', () => {
        if (!created) return HttpResponse.json([]);
        const { channels: _c, ...summary } = created;
        return HttpResponse.json([summary]);
      }),
      http.get('/api/guilds/g-novo', () => HttpResponse.json(created)),
      http.post('/api/guilds', async ({ request }) => {
        const { name } = (await request.json()) as { name: string };
        created = guild({
          id: 'g-novo',
          name,
          channels: [channel({ id: 'c-n', guildId: 'g-novo' })],
        });
        return HttpResponse.json(created, { status: 201 });
      }),
      http.get('/api/channels/c-n/messages', () =>
        HttpResponse.json({ messages: [], hasMore: false }),
      ),
    );
    renderApp('/channels');

    await user.click(await screen.findByRole('button', { name: 'Criar servidor' }));
    await user.type(screen.getByLabelText('Nome do servidor'), 'Sala dos Jogos');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Boas-vindas a #geral!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sala dos Jogos' })).toBeInTheDocument();
  });

  it('servidor inexistente ou sem acesso volta para /channels', async () => {
    withGuild();
    server.use(http.get('/api/guilds/g-x', () => notFound('Servidor não encontrado')));

    renderApp('/channels/g-x/c-y');

    // /channels redireciona para o servidor que o usuário tem
    expect(await screen.findByRole('heading', { name: 'geral' })).toBeInTheDocument();
  });
});

describe('histórico', () => {
  it('mostra as mensagens da mais antiga (em cima) para a mais nova', async () => {
    withGuild([
      message({ content: 'primeira', minutesAgo: 10 }),
      message({ content: 'segunda', minutesAgo: 5 }),
    ]);

    renderApp(CHANNEL_URL);

    await messageList();
    await waitFor(() => expect(texts()).toEqual(['primeira', 'segunda']));
  });

  it('carrega páginas anteriores pelo cursor, sem duplicar', async () => {
    const user = userEvent.setup();
    const recent = [message({ content: 'recente', minutesAgo: 1 })];
    const older = [message({ content: 'antiga', minutesAgo: 60 })];
    let cursor: string | null = null;
    withGuild();
    server.use(
      http.get('/api/channels/c-geral/messages', ({ request }) => {
        cursor = new URL(request.url).searchParams.get('before');
        return cursor
          ? HttpResponse.json({ messages: older, hasMore: false })
          : HttpResponse.json({ messages: recent, hasMore: true });
      }),
    );
    renderApp(CHANNEL_URL);

    await user.click(await screen.findByRole('button', { name: 'Carregar mensagens anteriores' }));

    await waitFor(() => expect(texts()).toEqual(['antiga', 'recente']));
    expect(cursor).toBe(recent[0]!.id);
    expect(screen.getByText('Este é o começo do canal.')).toBeInTheDocument();
  });
});

describe('enviar mensagem', () => {
  it('aparece na hora como pendente e é confirmada sem duplicar', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    let sentNonce = '';
    withGuild();
    server.use(
      http.post('/api/channels/c-geral/messages', async ({ request }) => {
        const body = (await request.json()) as { content: string; nonce: string };
        sentNonce = body.nonce;
        await new Promise<void>((r) => (release = r));
        return HttpResponse.json(
          message({ id: 'm-real', content: body.content, nonce: body.nonce }),
          { status: 201 },
        );
      }),
    );
    renderApp(CHANNEL_URL);

    await user.type(
      await screen.findByLabelText('Mensagem para #geral'),
      '  olá, pessoal  {Enter}',
    );

    // Otimista: já está na tela, marcada como pendente, e a caixa foi limpa.
    const pending = await screen.findByText('olá, pessoal');
    expect(pending.closest('li')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Mensagem para #geral')).toHaveValue('');

    // O eco do socket chega antes da resposta HTTP...
    fakeSocket.serverEmit(
      'message:created',
      message({ id: 'm-real', content: 'olá, pessoal', nonce: sentNonce }),
    );
    // ...e depois a resposta HTTP também chega.
    release();

    await waitFor(() =>
      expect(screen.getByText('olá, pessoal').closest('li')).not.toHaveAttribute('aria-busy'),
    );
    expect(screen.getAllByText('olá, pessoal')).toHaveLength(1);
  });

  it('se falhar, permite tentar de novo', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    withGuild();
    server.use(
      http.post('/api/channels/c-geral/messages', async ({ request }) => {
        attempts++;
        const body = (await request.json()) as { content: string; nonce: string };
        if (attempts === 1) {
          return HttpResponse.json({ statusCode: 500, message: 'Erro' }, { status: 500 });
        }
        return HttpResponse.json(message({ content: body.content, nonce: body.nonce }), {
          status: 201,
        });
      }),
    );
    renderApp(CHANNEL_URL);

    await user.type(await screen.findByLabelText('Mensagem para #geral'), 'vai falhar{Enter}');
    expect(await screen.findByText(/Não foi possível enviar/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() =>
      expect(screen.queryByText(/Não foi possível enviar/)).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText('vai falhar')).toHaveLength(1);
    expect(attempts).toBe(2);
  });

  it('Shift+Enter quebra linha; mensagem só com espaços não é enviada', async () => {
    const user = userEvent.setup();
    withGuild();
    renderApp(CHANNEL_URL);
    const box = await screen.findByLabelText('Mensagem para #geral');

    await user.type(box, '   {Enter}');
    await user.type(box, 'linha 1{Shift>}{Enter}{/Shift}linha 2');

    // Os espaços não foram enviados (continuam na caixa) e o Shift+Enter virou quebra de linha.
    // onUnhandledFrame: 'error' faria o teste falhar se o "   " tivesse virado um POST.
    expect(box).toHaveValue('   linha 1\nlinha 2');
  });
});

describe('tempo real', () => {
  it('mensagens de outras pessoas aparecem, mudam e somem conforme os eventos', async () => {
    withGuild([message({ content: 'oi', minutesAgo: 1 })]);
    renderApp(CHANNEL_URL);
    await messageList();
    await waitFor(() => expect(texts()).toEqual(['oi']));

    const fromAna = message({ content: 'oi, Gui!', author: otherUser });
    fakeSocket.serverEmit('message:created', fromAna);
    expect(await screen.findByText('Ana')).toBeInTheDocument();

    fakeSocket.serverEmit('message:updated', {
      ...fromAna,
      content: 'oi, Guilherme!',
      editedAt: new Date().toISOString(),
    });
    expect(await screen.findByText('oi, Guilherme!')).toBeInTheDocument();
    expect(screen.getByText('(editada)')).toBeInTheDocument();

    fakeSocket.serverEmit('message:deleted', { id: fromAna.id, channelId: 'c-geral' });
    await waitFor(() => expect(texts()).toEqual(['oi']));
  });

  it('canal criado por outra aba aparece na lista', async () => {
    withGuild();
    renderApp(CHANNEL_URL);
    const nav = await screen.findByRole('navigation', { name: 'Canais' });

    fakeSocket.serverEmit('channel:created', channel({ id: 'c-2', name: 'jogos', position: 1 }));

    expect(await within(nav).findByRole('link', { name: 'jogos' })).toBeInTheDocument();
  });

  it('servidor apagado enquanto aberto: sai dele', async () => {
    withGuild();
    renderApp(CHANNEL_URL);
    await screen.findByRole('heading', { name: 'geral' });
    server.use(
      http.get('/api/guilds', () => HttpResponse.json([])),
      http.get('/api/guilds/g-1', () => notFound()),
    );

    fakeSocket.serverEmit('guild:deleted', { id: 'g-1' });

    expect(
      await screen.findByRole('heading', { name: 'Você ainda não está em nenhum servidor' }),
    ).toBeInTheDocument();
  });

  it('desconecta o socket ao sair da conta', async () => {
    const user = userEvent.setup();
    withGuild();
    renderApp(CHANNEL_URL);
    await screen.findByRole('heading', { name: 'geral' });
    expect(fakeSocket.connected).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(fakeSocket.connected).toBe(false));
    expect(fakeSocket.listenerCount('message:created')).toBe(0);
  });
});

describe('editar e apagar', () => {
  it('o autor edita a própria mensagem', async () => {
    const user = userEvent.setup();
    const mine = message({ content: 'com erro', minutesAgo: 1 });
    withGuild([mine]);
    server.use(
      http.patch(`/api/messages/${mine.id}`, async ({ request }) => {
        const { content } = (await request.json()) as { content: string };
        return HttpResponse.json({ ...mine, content, editedAt: new Date().toISOString() });
      }),
    );
    renderApp(CHANNEL_URL);

    await user.click(await screen.findByRole('button', { name: 'Editar mensagem' }));
    const box = screen.getByRole('textbox', { name: 'Editar mensagem' });
    await user.clear(box);
    await user.type(box, 'corrigida{Enter}');

    expect(await screen.findByText('corrigida')).toBeInTheDocument();
    expect(screen.getByText('(editada)')).toBeInTheDocument();
  });

  it('não mostra editar na mensagem de outra pessoa; o dono pode apagar', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fromAna = message({ content: 'da Ana', author: otherUser, minutesAgo: 1 });
    withGuild([fromAna]);
    server.use(
      http.delete(`/api/messages/${fromAna.id}`, async () => {
        await delay(10);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(CHANNEL_URL);

    await screen.findByText('da Ana');
    expect(screen.queryByRole('button', { name: 'Editar mensagem' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apagar mensagem' }));

    await waitFor(() => expect(screen.queryByText('da Ana')).not.toBeInTheDocument());
  });
});
