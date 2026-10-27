import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { authResponse, server, unauthorized } from './test/server';

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const loggedIn = () =>
  server.use(http.post('/api/auth/refresh', () => HttpResponse.json(authResponse())));

describe('rotas protegidas e sessão', () => {
  it('sem sessão, a home redireciona para o login', async () => {
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Boas-vindas de volta!' }),
    ).toBeInTheDocument();
  });

  it('com o cookie de sessão, restaura o login ao abrir o app (F5)', async () => {
    loggedIn();

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Olá, Guilherme!' })).toBeInTheDocument();
  });

  it('quem já está logado e abre /login vai para a home', async () => {
    loggedIn();

    renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Olá, Guilherme!' })).toBeInTheDocument();
  });
});

describe('login', () => {
  it('entra com credenciais válidas e vai para a home', async () => {
    const user = userEvent.setup();
    let sentBody: unknown;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(authResponse());
      }),
    );
    renderApp('/login');

    await user.type(await screen.findByLabelText('E-mail'), ' Gui@Example.com ');
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Olá, Guilherme!' })).toBeInTheDocument();
    // O schema do shared normalizou o e-mail antes de enviar
    expect(sentBody).toEqual({ email: 'gui@example.com', password: 'senha-forte-123' });
  });

  it('mostra o erro da API quando a senha está errada', async () => {
    const user = userEvent.setup();
    server.use(http.post('/api/auth/login', () => unauthorized('E-mail ou senha incorretos')));
    renderApp('/login');

    await user.type(await screen.findByLabelText('E-mail'), 'gui@example.com');
    await user.type(screen.getByLabelText('Senha'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos');
    expect(screen.queryByRole('heading', { name: /Olá/ })).not.toBeInTheDocument();
  });
});

describe('cadastro', () => {
  it('valida no cliente com o schema do shared, sem chamar a API', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
    expect(screen.getByText('A senha precisa ter pelo menos 8 caracteres')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    // onUnhandledFrame: 'error' faria o teste falhar se houvesse POST /api/auth/register
  });

  it('mostra erros por campo vindos do servidor (409)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'E-mail ou usuário já cadastrado',
            fieldErrors: { username: ['Usuário já existe'] },
          },
          { status: 409 },
        ),
      ),
    );
    renderApp('/register');

    await user.type(await screen.findByLabelText('E-mail'), 'gui@example.com');
    await user.type(screen.getByLabelText('Nome de exibição'), 'Guilherme');
    await user.type(screen.getByLabelText('Nome de usuário'), 'gui');
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Usuário já existe')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome de usuário')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('logout', () => {
  it('chama a API e volta para o login', async () => {
    const user = userEvent.setup();
    loggedIn();
    let loggedOut = false;
    server.use(
      http.post('/api/auth/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(
      await screen.findByRole('heading', { name: 'Boas-vindas de volta!' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(loggedOut).toBe(true));
  });
});
