# ROADMAP — discord-2

> **Fonte da verdade do projeto.** Toda sessão nova começa lendo este arquivo.
> Ideias novas entram na seção [Backlog](#backlog-ideias-para-depois) e só são feitas depois da fase atual.

## Visão

App no estilo Discord para portfólio e uso real com amigos. O foco é **compartilhar tela**, inclusive com quem usa iPhone.
Prioridade: PC (web + desktop) primeiro, mobile depois. Custo: o mínimo possível (planos gratuitos).

## Status das fases

| Fase | Entrega                                                                   | Status       |
| ---- | ------------------------------------------------------------------------- | ------------ |
| 0    | Fundação: monorepo, Postgres, `/health`, tela inicial, lint, testes, CI   | ✅ Concluída |
| 1    | Contas: cadastro, login, sessão persistente com refresh token             | ⏳ Próxima   |
| 2    | Servidores e chat: canais de texto, mensagens em tempo real, paginação    | —            |
| 3    | Social: convites, membros, presença, "digitando...", DMs                  | —            |
| 4    | Voz com LiveKit                                                           | —            |
| 5    | Compartilhamento de tela no navegador (getDisplayMedia)                   | —            |
| 6    | App desktop Electron: seletor de tela/janela, áudio do sistema, `.exe`    | —            |
| 7    | Deploy gratuito (back, banco, LiveKit Cloud)                              | —            |
| 8    | Mobile com Expo (incluindo tela no iOS via ReplayKit/Broadcast Extension) | —            |

---

## Fase 0 — Fundação ✅ (27/10/2026)

### O que foi feito

- **Monorepo** com npm workspaces: `packages/shared`, `apps/server`, `apps/web`.
- **`docker-compose.yml`** com Postgres 17 na porta `5433` (configurável), volume nomeado e healthcheck.
- **`packages/shared`**: schema Zod `healthResponseSchema` + tipo `HealthResponse` derivado dele.
- **`apps/server`** (NestJS 12 + Prisma 7):
  - `GET /health` → `{ status, uptime, timestamp, db }`; faz `SELECT 1` no banco com timeout de 2s.
  - Responde **200** se tudo ok e **503** se o banco estiver fora (corpo sempre no mesmo formato).
  - Variáveis de ambiente validadas com Zod na inicialização (_fail fast_).
  - O servidor sobe mesmo sem banco (a conexão é aberta sob demanda).
- **`apps/web`** (React 19 + Vite 8): tela inicial mostra servidor online/offline e banco up/down.
- **Qualidade**: ESLint 10 com regras que usam tipos + Prettier; Vitest em todos os pacotes.
- **Testes (13)**: schema (3), service com Prisma mockado (3), HTTP com supertest (2), banco real (1), componente React (4).
- **CI** (GitHub Actions): format, lint, typecheck, testes com Postgres como _service container_, build.

### Decisões tomadas

| Decisão                                                    | Motivo                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tudo ESM** (`"type": "module"`)                          | O NestJS 12 é ESM puro; um formato só no monorepo evita dor de cabeça. Imports relativos levam `.js` no server/shared (regra do `NodeNext`).       |
| **TypeScript 6.0** (não 7)                                 | O TS 7 (reescrito em Go) acabou de sair, mas o `typescript-eslint` ainda exige `<6.1`. Rever quando houver suporte.                                |
| **Prisma 7** (não 8)                                       | A tag `latest` do npm aponta para uma RC do 8. Usamos a versão estável. O Prisma 7 usa `prisma.config.ts` + driver adapter (`@prisma/adapter-pg`). |
| **Cliente Prisma gerado em `src/generated`** (fora do git) | Gerado no `postinstall`. O `prisma.config.ts` não exige `DATABASE_URL`, para o `npm install` funcionar antes de existir um `.env`.                 |
| **Vitest em todo lugar** (não Jest)                        | Um runner só. No Nest, usamos `unplugin-swc` porque o esbuild não emite metadados de decorators (necessários para a injeção de dependência).       |
| **Proxy do Vite** `/api → server`                          | Em dev o navegador fala com uma origem só, então não precisa de CORS. Em produção será revisto (Fase 7).                                           |
| **`shared` compilado para `dist/`**                        | O server (Node) e o web (Vite) consomem JS + `.d.ts` padrão. O `npm run dev` roda o `tsc --watch` do shared junto.                                 |
| **Teste de banco real opcional** (`DB_TESTS=1`)            | `npm test` local não depende do Docker estar aberto; o CI sempre roda com banco.                                                                   |
| **503 quando degradado**                                   | Load balancers e monitores entendem o status HTTP, e o corpo continua dizendo o que falhou.                                                        |
| **Portas**: Postgres 5433, server 3100, web 5174           | Fora do padrão para não colidir com outros serviços; tudo configurável no `.env`.                                                                  |

### Imprevistos encontrados

- O **WSL Ubuntu** está quebrado (o disco `ext4.vhdx` não foi encontrado). Não afeta o projeto: o Docker Desktop usa a distro própria dele e trabalhamos direto no Windows.
- Na primeira instalação de dependências num workspace recém-criado, o npm às vezes **não grava** as dependências no `package.json`. Basta rodar o `npm i -w <pacote> ...` de novo e conferir.
- O primeiro CI falhou no **lint**: o ESLint (com regras que usam tipos) precisa dos `.d.ts` do `shared`, que só existem depois do build. No PC passava porque o `dist/` já existia. Correção: o script `lint` compila o `shared` antes, igual a `test` e `typecheck`. Lição: para reproduzir o CI no PC, apague os artefatos de build antes.
- O PowerShell 5.1 lê arquivos UTF-8 como ANSI e **corrompe acentos**. Não usar `Get-Content`/`Set-Content` para editar código.

### Pendências e observações

- [ ] Criar o repositório no GitHub e dar o primeiro push (aguardando confirmação) para ver o CI rodar de verdade.
- O bundle do web tem ~290 kB, a maior parte do Zod. Avaliar `zod/mini` no front se pesar.

---

## Fase 1 — Contas (próxima)

Escopo previsto: cadastro, login, senha com argon2, JWT access token + refresh token (rotação), sessão persistente no web.
_Plano detalhado a ser apresentado antes de começar._

---

## Backlog (ideias para depois)

- Git hooks (husky + lint-staged) para rodar lint/format antes do commit.
- Badge do CI e screenshots no README.
