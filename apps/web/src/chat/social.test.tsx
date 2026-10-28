import type { DmChannelDto, MemberDto } from '@discord-2/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { redirectTarget } from '../auth/redirect';
import { fakeSocket } from '../test/fakeSocket';
import {
  authResponse,
  guild,
  message,
  notFound,
  otherUser,
  server,
  testUser,
} from '../test/server';
import { activeTypers, TYPING_TTL_MS, typingLabel } from './cache';

const CHANNEL_URL = '/channels/g-1/c-geral';
const me = { id: testUser.id, username: testUser.username, displayName: testUser.displayName };

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function member(user: typeof me, overrides: Partial<MemberDto> = {}): MemberDto {
  return {
    user,
    role: 'MEMBER',
    joinedAt: '2026-10-27T12:00:00.000Z',
    online: false,
    ...overrides,
  };
}

/** Logado, num servidor do qual o Gui é dono, com estes membros. */
function withGuild(members: MemberDto[] = [member(me, { role: 'OWNER', online: true })]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    http.get('/api/guilds', () => {
      const { channels: _c, ...summary } = guild();
      return HttpResponse.json([summary]);
    }),
    http.get('/api/guilds/g-1', () => HttpResponse.json(guild())),
    http.get('/api/guilds/g-1/members', () => HttpResponse.json(members)),
    http.get('/api/channels/c-geral/messages', () =>
      HttpResponse.json({ messages: [], hasMore: false }),
    ),
  );
}

const memberBar = () => screen.findByRole('complementary', { name: 'Membros' });

describe('convite', () => {
  it('mostra a prévia e, ao aceitar, entra no servidor', async () => {
    const user = userEvent.setup();
    let accepted = false;
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      http.get('/api/invites/AbCd1234', () =>
        HttpResponse.json({
          code: 'AbCd1234',
          guild: { id: 'g-1', name: 'Os Amigos' },
          memberCount: 3,
          expiresAt: null,
          alreadyMember: false,
        }),
      ),
      http.post('/api/invites/AbCd1234', () => {
        accepted = true;
        return HttpResponse.json(guild());
      }),
      http.get('/api/guilds', () => {
        if (!accepted) return HttpResponse.json([]);
        const { channels: _c, ...summary } = guild();
        return HttpResponse.json([summary]);
      }),
      http.get('/api/guilds/g-1', () => HttpResponse.json(guild())),
      http.get('/api/channels/c-geral/messages', () =>
        HttpResponse.json({ messages: [], hasMore: false }),
      ),
    );
    renderApp('/invite/AbCd1234');

    expect(await screen.findByRole('heading', { name: 'Os Amigos' })).toBeInTheDocument();
    expect(screen.getByText('3 membros')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aceitar convite' }));

    expect(await screen.findByRole('heading', { name: 'geral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Os Amigos' })).toBeInTheDocument();
  });

  it('convite inválido ou expirado', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      http.get('/api/invites/velho123', () => notFound('Convite inválido ou expirado')),
    );

    renderApp('/invite/velho123');

    expect(await screen.findByRole('heading', { name: 'Convite inválido' })).toBeInTheDocument();
  });

  it('deslogado: faz login e volta para o convite', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/auth/login', () => HttpResponse.json(authResponse())),
      http.get('/api/invites/AbCd1234', () =>
        HttpResponse.json({
          code: 'AbCd1234',
          guild: { id: 'g-1', name: 'Os Amigos' },
          memberCount: 1,
          expiresAt: null,
          alreadyMember: false,
        }),
      ),
    );
    renderApp('/invite/AbCd1234');

    await user.type(await screen.findByLabelText('E-mail'), 'gui@example.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('button', { name: 'Aceitar convite' })).toBeInTheDocument();
  });

  it('o link "Cadastre-se" do login mantém o destino do convite', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/auth/register', () => HttpResponse.json(authResponse(), { status: 201 })),
      http.get('/api/invites/AbCd1234', () =>
        HttpResponse.json({
          code: 'AbCd1234',
          guild: { id: 'g-1', name: 'Os Amigos' },
          memberCount: 1,
          expiresAt: null,
          alreadyMember: false,
        }),
      ),
    );
    renderApp('/invite/AbCd1234');

    await user.click(await screen.findByRole('link', { name: 'Cadastre-se' }));
    await user.type(await screen.findByLabelText('E-mail'), 'nova@example.com');
    await user.type(screen.getByLabelText('Nome de exibição'), 'Nova');
    await user.type(screen.getByLabelText('Nome de usuário'), 'nova');
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('button', { name: 'Aceitar convite' })).toBeInTheDocument();
  });

  it('gera o link no modal de convite', async () => {
    const user = userEvent.setup();
    let sentExpiration: unknown;
    withGuild();
    server.use(
      http.post('/api/guilds/g-1/invites', async ({ request }) => {
        sentExpiration = ((await request.json()) as { expiresIn: string }).expiresIn;
        return HttpResponse.json(
          {
            code: 'Zz99Yy88',
            guildId: 'g-1',
            creator: me,
            uses: 0,
            expiresAt: null,
            createdAt: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
    );
    renderApp(CHANNEL_URL);

    await user.click(await screen.findByRole('button', { name: 'Convidar pessoas' }));
    await user.selectOptions(screen.getByLabelText('Expira em'), 'never');
    await user.click(screen.getByRole('button', { name: 'Gerar link de convite' }));

    expect(await screen.findByLabelText('Link de convite')).toHaveValue(
      `${window.location.origin}/invite/Zz99Yy88`,
    );
    expect(sentExpiration).toBe('never');
  });
});

describe('redirectTarget (proteção contra open redirect)', () => {
  it.each([
    [{ from: '/invite/abc' }, '/invite/abc'],
    [{ from: '//site-malicioso.com' }, '/'],
    [{ from: 'https://site-malicioso.com' }, '/'],
    [{ from: 42 }, '/'],
    [null, '/'],
  ])('%j → %j', (state, expected) => {
    expect(redirectTarget(state)).toBe(expected);
  });
});

describe('membros e presença', () => {
  it('separa online e offline e reage aos eventos de presença', async () => {
    withGuild([member(me, { role: 'OWNER', online: true }), member(otherUser)]);
    renderApp(CHANNEL_URL);
    const bar = await memberBar();

    expect(await within(bar).findByRole('heading', { name: 'Offline — 1' })).toBeInTheDocument();

    fakeSocket.serverEmit('presence:update', { userId: otherUser.id, online: true });

    expect(await within(bar).findByRole('heading', { name: 'Online — 2' })).toBeInTheDocument();
    expect(within(bar).queryByRole('heading', { name: /Offline/ })).not.toBeInTheDocument();
  });

  it('quem entra e quem sai atualiza a lista na hora', async () => {
    withGuild();
    renderApp(CHANNEL_URL);
    const bar = await memberBar();
    await within(bar).findByText('Guilherme');

    fakeSocket.serverEmit('member:joined', {
      guildId: 'g-1',
      member: member(otherUser, { online: true }),
    });
    expect(await within(bar).findByText('Ana')).toBeInTheDocument();

    fakeSocket.serverEmit('member:left', { guildId: 'g-1', userId: otherUser.id });
    await waitFor(() => expect(within(bar).queryByText('Ana')).not.toBeInTheDocument());
  });

  it('o dono expulsa um membro', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let kicked = '';
    withGuild([member(me, { role: 'OWNER', online: true }), member(otherUser)]);
    server.use(
      http.delete('/api/guilds/g-1/members/:userId', ({ params }) => {
        kicked = params.userId as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(CHANNEL_URL);

    await user.click(await screen.findByRole('button', { name: 'Expulsar Ana' }));

    await waitFor(() => expect(screen.queryByText('Ana')).not.toBeInTheDocument());
    expect(kicked).toBe(otherUser.id);
  });

  it('quem não é dono vê "Sair do servidor" e sai', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let left = false;
    withGuild();
    server.use(
      http.get('/api/guilds/g-1', () => HttpResponse.json(guild({ ownerId: otherUser.id }))),
      http.post('/api/guilds/g-1/leave', () => {
        left = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('/api/guilds', () => (left ? HttpResponse.json([]) : HttpResponse.json([guild()]))),
    );
    renderApp(CHANNEL_URL);

    expect(await screen.findByRole('button', { name: 'Sair do servidor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apagar servidor' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair do servidor' }));

    expect(
      await screen.findByRole('heading', { name: 'Você ainda não está em nenhum servidor' }),
    ).toBeInTheDocument();
  });

  it('expulso (guild:removed): sai da tela do servidor', async () => {
    withGuild();
    renderApp(CHANNEL_URL);
    await screen.findByRole('heading', { name: 'geral' });
    server.use(http.get('/api/guilds', () => HttpResponse.json([])));

    fakeSocket.serverEmit('guild:removed', { id: 'g-1' });

    expect(
      await screen.findByRole('heading', { name: 'Você ainda não está em nenhum servidor' }),
    ).toBeInTheDocument();
  });
});

describe('digitando', () => {
  it('mostra quem está digitando e some quando a mensagem dessa pessoa chega', async () => {
    withGuild();
    renderApp(CHANNEL_URL);
    await screen.findByRole('heading', { name: 'geral' });

    fakeSocket.serverEmit('typing', { channelId: 'c-geral', user: otherUser });
    expect(await screen.findByText('Ana está digitando…')).toBeInTheDocument();

    fakeSocket.serverEmit('message:created', message({ author: otherUser, content: 'oi' }));
    await waitFor(() => expect(screen.queryByText(/está digitando/)).not.toBeInTheDocument());
  });

  it('a caixa de texto avisa o servidor, no máximo a cada 3 s', async () => {
    const user = userEvent.setup();
    withGuild();
    renderApp(CHANNEL_URL);

    await user.type(
      await screen.findByLabelText('Mensagem para #geral'),
      'digitando várias letras',
    );

    const typing = fakeSocket.emitted.filter((e) => e.event === 'typing:start');
    expect(typing).toEqual([{ event: 'typing:start', payload: { channelId: 'c-geral' } }]);
  });

  it('regras puras: ignora a si mesmo, expira e monta o texto', () => {
    const now = 100_000;
    const map = {
      [me.id]: { user: me, at: now },
      a: { user: { ...otherUser, id: 'a', displayName: 'Ana' }, at: now - 1000 },
      b: { user: { ...otherUser, id: 'b', displayName: 'Bia' }, at: now - TYPING_TTL_MS - 1 },
    };

    const typers = activeTypers(map, me.id, now);

    expect(typers.map((u) => u.displayName)).toEqual(['Ana']);
    expect(typingLabel([])).toBeNull();
    expect(typingLabel([otherUser, { ...otherUser, displayName: 'Bia' }])).toBe(
      'Ana e Bia estão digitando…',
    );
    expect(typingLabel([otherUser, otherUser, otherUser])).toBe('Várias pessoas estão digitando…');
  });
});

describe('mensagens diretas', () => {
  const dm: DmChannelDto = {
    id: 'dm-1',
    type: 'DM',
    recipient: otherUser,
    recipientOnline: true,
    createdAt: '2026-10-27T12:00:00.000Z',
    lastMessageAt: null,
  };

  it('abre a DM pela lista de membros e conversa nela', async () => {
    const user = userEvent.setup();
    withGuild([member(me, { role: 'OWNER', online: true }), member(otherUser, { online: true })]);
    server.use(
      http.post('/api/dms', () => HttpResponse.json(dm)),
      http.get('/api/dms', () => HttpResponse.json([dm])),
      http.get('/api/channels/dm-1/messages', () =>
        HttpResponse.json({ messages: [], hasMore: false }),
      ),
    );
    renderApp(CHANNEL_URL);

    await user.click(await screen.findByRole('button', { name: 'Enviar mensagem para Ana' }));

    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem para @Ana')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Conversas' })).toHaveTextContent('Ana');

    fakeSocket.serverEmit(
      'message:created',
      message({ channelId: 'dm-1', author: otherUser, content: 'oi, só pra você' }),
    );
    expect(await screen.findByText('oi, só pra você')).toBeInTheDocument();
  });

  it('DM nova criada pela outra pessoa aparece na lista', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      http.get('/api/dms', () => HttpResponse.json([])),
    );
    renderApp('/channels/@me');
    const nav = await screen.findByRole('navigation', { name: 'Conversas' });
    await within(nav).findByText(/Nenhuma conversa/);

    fakeSocket.serverEmit('dm:created', { ...dm, recipient: { ...otherUser, displayName: 'Bia' } });

    expect(await within(nav).findByRole('link', { name: /Bia/ })).toBeInTheDocument();
  });

  it('canal de DM inexistente volta para a lista de conversas', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      http.get('/api/dms', () => HttpResponse.json([dm])),
    );

    renderApp('/channels/@me/nao-existe');

    expect(await screen.findByRole('heading', { name: 'Suas conversas' })).toBeInTheDocument();
  });
});
