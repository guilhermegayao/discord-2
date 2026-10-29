# discord-2

App de chat, voz e **compartilhamento de tela** no estilo Discord, feito para usar com amigos (inclusive quem usa iPhone) e como projeto de portfólio.

> 🚧 Em desenvolvimento. Veja o progresso e as decisões no [ROADMAP.md](ROADMAP.md).

## Stack

| Parte         | Tecnologias                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| Servidor      | NestJS 12, Prisma 7, PostgreSQL 17, Socket.IO, Zod, LiveKit Server SDK               |
| Voz           | LiveKit (servidor de mídia WebRTC, rodando no Docker)                                |
| Web           | React 19, Vite 8, TanStack Query, React Router, livekit-client, TypeScript           |
| Compartilhado | `@discord-2/shared`: schemas Zod, tipos e eventos do socket usados por todos os apps |
| Qualidade     | Vitest, Testing Library, MSW, supertest, ESLint, Prettier, GitHub Actions            |
| Em breve      | Electron (desktop), Expo (mobile)                                                    |

## O que já funciona

- Contas: cadastro, login e sessão que sobrevive ao F5, com rotação de refresh token.
- Servidores e canais de texto, no estilo Discord.
- Chat em **tempo real**: mensagens aparecem na hora em todas as abas e dispositivos, com envio otimista.
- Histórico paginado: rolando para cima, as mensagens antigas carregam sem a tela pular.
- Editar e apagar mensagens (o dono do servidor pode moderar).
- **Convite por link** (funciona até para quem ainda não tem conta: cadastra e volta para o convite).
- Lista de membros com **online/offline** ao vivo, sair do servidor e expulsar.
- "**Fulano está digitando…**"
- **Mensagens diretas** entre quem divide um servidor.
- **Canais de voz**: veja quem está em cada um e quem está falando, com mutar, ensurdecer e escolha de microfone. A voz continua conectada enquanto você navega.
- **Compartilhamento de tela** dentro da voz, com três qualidades (Vídeo/jogo, Texto/código, Economia) e áudio da aba ou do sistema (Chrome/Edge). Quem quer assistir clica em "Assistir", com tela cheia. Quem não assiste não gasta internet com a imagem.
- **App para Windows** (Electron) com seletor próprio de tela/janela, **som do PC sem eco** e instalador `.exe`.

### Testar com duas contas no mesmo navegador

Cada origem guarda seus próprios cookies. Use uma conta em `http://localhost:5174` e outra em `http://[::1]:5174`, ou dois navegadores diferentes.

## Estrutura

```
discord-2/
├── apps/
│   ├── desktop/   → app Windows (Electron) + instalador
│   ├── server/    → API NestJS + Prisma
│   └── web/       → front-end React + Vite
├── packages/
│   └── shared/    → tipos e validações compartilhados
├── docker-compose.yml
└── ROADMAP.md
```

## Como rodar

Pré-requisitos: **Node.js 24+** e **Docker Desktop** (aberto).

```bash
npm install
```

```bash
cp .env.example .env
```

No PowerShell, use `Copy-Item .env.example .env`.

Troque o `JWT_ACCESS_SECRET` do `.env` por um valor aleatório. Este comando gera um:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Suba o banco e aplique as migrations:

```bash
docker compose up -d
```

```bash
npm run prisma:deploy -w @discord-2/server
```

```bash
npm run dev
```

Depois abra **http://localhost:5174**: você cai na tela de login. Crie uma conta em "Cadastre-se".
A API responde em **http://localhost:3100/api** (por exemplo, `/api/health`).

> Na primeira execução, o Firewall do Windows pode pedir permissão para o Node.js. Permitir em redes privadas é suficiente.

### Portas (configuráveis no `.env`)

| Serviço    | Porta padrão |
| ---------- | ------------ |
| PostgreSQL | 5433         |
| Servidor   | 3100         |
| Web        | 5174         |

## Scripts

| Comando                     | O que faz                                      |
| --------------------------- | ---------------------------------------------- |
| `npm run dev`               | Sobe shared (watch), servidor e web juntos     |
| `npm test`                  | Roda os testes de todos os pacotes             |
| `npm run lint`              | ESLint em todo o monorepo                      |
| `npm run format`            | Formata com Prettier                           |
| `npm run typecheck`         | Checagem de tipos em todos os pacotes          |
| `npm run build`             | Build de produção                              |
| `npm run db:up` / `db:down` | Sobe ou derruba o Postgres                     |
| `npm run dev:desktop`       | Abre o app desktop (com `npm run dev` rodando) |
| `npm run dist:desktop`      | Gera o instalador em `apps/desktop/release/`   |

Os testes de integração com o banco real rodam só com `DB_TESTS=1` (sempre ativo no CI). Eles usam um banco separado, `discord2_test`, criado automaticamente; o banco de desenvolvimento não é tocado.

```powershell
$env:DB_TESTS='1'; npm test -w @discord-2/server
```

## App para Windows

O app desktop abre o mesmo front do navegador numa janela própria, com um seletor de tela/janela no estilo do app.

- **Baixar**: na aba _Actions_ do GitHub, abra a execução mais recente do CI e baixe o artefato `discord-2-windows` (um `.zip` com o instalador).
- **Gerar na sua máquina**: `npm run dist:desktop` (o `.exe` sai em `apps/desktop/release/`).
- **Primeira execução**: o instalador não é assinado, então o Windows SmartScreen mostra "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.
- Por enquanto o app aponta para `http://localhost:5174`, então o projeto precisa estar rodando (`npm run dev`). Para outra URL, defina `DISCORD2_APP_URL` antes de abrir.
- **Som do PC sem eco** (Windows 11): no seletor, deixe marcado **🔊 Incluir som do PC**. Vai o som de jogos, vídeos e música, mas não as vozes da chamada, que tocam dentro do app.
- Gerar o instalador na sua máquina exige o **Visual Studio Build Tools** (carga "Desenvolvimento para desktop com C++"), por causa do módulo nativo de áudio.

## Autenticação (resumo)

- Senha com **argon2id**.
- **Access token** JWT de 15 min, guardado só em memória no front.
- **Refresh token** de 30 dias num cookie `httpOnly` + `SameSite=Lax`, com **rotação e detecção de reuso**.
- Toda rota da API é privada por padrão (`@Public()` libera).
- Rate limit em cadastro e login.

Detalhes e motivos no [ROADMAP.md](ROADMAP.md#fase-1--contas--27102026).

## Problemas comuns

- **`npm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada`** (PowerShell no Windows): use `npm.cmd` no lugar de `npm`, ou troque o terminal do VS Code para **Command Prompt** / **Git Bash** (setinha ⌄ ao lado do "+"). Outra opção é liberar scripts só para o seu usuário com `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (muda uma configuração de segurança; decida você).
- **`failed to connect to the docker API`**: o Docker Desktop não está aberto. Abra-o e espere o ícone ficar verde.
- **Porta em uso**: mude a porta no `.env` (por exemplo `POSTGRES_PORT=5434`) e ajuste a `DATABASE_URL`.
- **Banco: down na tela**: confira se o container está `healthy` com `docker compose ps`.
- **Erro ao cadastrar logo depois de clonar**: faltou aplicar as migrations (`npm run prisma:deploy -w @discord-2/server`).
- **"Não foi possível entrar no canal de voz"**: o container do LiveKit não está rodando (`docker compose ps`). Suba tudo com `docker compose up -d`.
- **"O navegador bloqueou o microfone"**: clique no cadeado da barra de endereço e permita o microfone para `localhost`.
- **Microfonia ao testar voz com duas abas no mesmo PC**: use fone de ouvido.
- **O servidor não sobe e reclama de `LIVEKIT_*`**: o `.env` é anterior à Fase 4. Copie as linhas novas do `.env.example`.
- **O servidor não sobe e reclama de `JWT_ACCESS_SECRET`**: o `.env` é anterior à Fase 1. Copie as linhas novas do `.env.example`.
