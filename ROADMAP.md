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
| 1    | Contas: cadastro, login, sessão persistente com refresh token             | ✅ Concluída |
| 2    | Servidores e chat: canais de texto, mensagens em tempo real, paginação    | ⏳ Próxima   |
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

- [x] Repositório público criado: https://github.com/guilhermegayao/discord-2 (CI verde).
- [x] Actions atualizadas para `checkout@v7` / `setup-node@v7` (a v4 usava Node 20, obsoleto).
- O bundle do web tem ~290 kB, a maior parte do Zod. Avaliar `zod/mini` no front se pesar.

---

## Fase 1 — Contas ✅ (27/10/2026)

### O que foi feito

- **Banco**: models `User` e `Session` (IDs UUID v7), primeira migration.
- **`shared`**: schemas `registerSchema`, `loginSchema`, `userSchema`, `authResponseSchema`, `apiErrorSchema`. As mesmas regras e mensagens valem no servidor e no formulário.
- **Servidor** (todas as rotas agora em `/api`):
  - `POST /api/auth/register`, `/login`, `/refresh`, `/logout` e `GET /api/users/me`.
  - Senha com **argon2id** (64 MiB, 3 iterações).
  - **Access token** JWT HS256 de 15 min. **Refresh token** aleatório de 30 dias num cookie `httpOnly`, `SameSite=Lax`, `path=/api/auth`; o banco guarda só o SHA-256.
  - **Rotação com detecção de reuso**: usar um refresh token já usado revoga a família inteira (só daquele login; outros dispositivos seguem logados).
  - **`AuthGuard` global**: toda rota é privada, a não ser que tenha `@Public()`.
  - **Rate limit**: 120 req/min por IP no geral e 10 req/min em cadastro/login.
  - Login com resposta e tempo iguais para "e-mail inexistente" e "senha errada".
- **Web**:
  - Páginas `/login` e `/register` (react-hook-form + schemas do shared); erros do servidor aparecem embaixo de cada campo.
  - Home protegida com "Olá, {nome}" e botão Sair.
  - Access token **só em memória**. Ao abrir o app, a sessão é restaurada pelo cookie.
  - Cliente HTTP: em caso de 401, renova a sessão uma vez e repete a chamada. O refresh é _single-flight_ na aba e serializado entre abas com a **Web Locks API**.
- **Testes (71 no total)**:
  - shared: 12;
  - server: 41, sendo 24 de unidade e 17 de integração com Postgres real num banco `discord2_test` separado;
  - web: 18, com **MSW**.
- **CI**: novo passo que falha se o `schema.prisma` mudar sem migration (`prisma:check`).
- **Testado manualmente no navegador**: cadastro, validação, F5, sair, senha errada e login; `document.cookie` e `localStorage` ficam vazios.

### Decisões tomadas

| Decisão                                                      | Motivo                                                                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prefixo `/api` no servidor**, proxy do Vite sem reescrever | O cookie de refresh usa `path=/api/auth`. Se o proxy removesse o `/api`, o caminho visto pelo navegador e pelo servidor seriam diferentes e o cookie não seria enviado. O health virou `/api/health`. |
| **Access token em memória**, refresh em cookie `httpOnly`    | Num XSS, não há token salvo para roubar. O cookie `SameSite=Lax` e restrito a `/api/auth` reduz o risco de CSRF e a exposição.                                                                        |
| **Refresh token opaco** (não JWT) + hash SHA-256 no banco    | Pode ser revogado a qualquer momento. SHA-256 basta porque o token tem 256 bits aleatórios (senha precisa de argon2; token aleatório não).                                                            |
| **Rotação com detecção de reuso** por família                | Padrão do OAuth 2.0 Security BCP: um token roubado e usado depois do legítimo derruba a sessão inteira.                                                                                               |
| **Guard próprio** em vez de Passport                         | Para JWT simples o Passport só adiciona camadas. O guard tem ~30 linhas e dá para explicar cada uma.                                                                                                  |
| **Seguro por padrão** (`AuthGuard` global + `@Public()`)     | Esquecer um decorator deixa a rota fechada, não aberta.                                                                                                                                               |
| **Web Locks API** para o refresh entre abas                  | Duas abas renovando ao mesmo tempo usariam o mesmo cookie, e o servidor trataria como roubo. Com o lock, a segunda aba espera e já usa o cookie novo.                                                 |
| **Banco de teste separado** (`<db>_test`)                    | Os testes limpam tabelas; nunca devem tocar o banco de dev. O `globalSetup` cria o banco e aplica as migrations. Ele se recusa a rodar se o nome não terminar em `_test`.                             |
| **MSW** em vez de mockar `fetch`                             | Intercepta na rede: o teste exercita o cliente real (headers, retry, refresh) e não depende de como o código chama o `fetch`.                                                                         |
| **Mobile (Fase 8)**: refresh token no corpo + SecureStore    | App nativo não tem cookie como o navegador. A API vai aceitar as duas formas quando chegarmos lá.                                                                                                     |

### Imprevistos encontrados

- **MSW 3 renomeou** `onUnhandledRequest` para `onUnhandledFrame`. Com o nome antigo, a opção era **ignorada em silêncio** e um teste que deveria garantir "nenhuma chamada à API" passava sem garantir nada. O typecheck pegou. Confirmei com um teste de mutação: tirei a validação do formulário e o teste falhou como devia.
- **`globalSetup` do Vitest** roda no processo principal, onde o `test.env` da config ainda não foi aplicado. Por isso a URL do banco é lida de `project.config.env`. Além disso, o Vitest quebrava ao mostrar o erro original (`code.charCodeAt is not a function`); só deu para ver a causa rodando o setup direto no Node.
- O lint (`@typescript-eslint/unbound-method`) pegou funções do contexto de auth declaradas como **métodos**: ao desestruturar (`const { login } = useAuth()`), um método perderia o `this`. Viraram propriedades com tipo de função.
- O lint (`react-hooks/set-state-in-effect`) já tinha pegado na Fase 0 um `setState` síncrono dentro de efeito; nesta fase o padrão foi seguido desde o início.

### Pendências e observações

- O rate limit usa o IP da conexão. Atrás de um proxy (Fase 7) vai precisar de `trust proxy`, senão todo mundo terá o IP do proxy.
- Cadastro revela se um e-mail já existe (inevitável sem verificação por e-mail). Aceitável por agora.
- Sessões revogadas e expiradas ficam no banco; uma limpeza periódica pode entrar depois.

---

## Fase 2 — Servidores e chat (próxima)

Escopo previsto: criar servidor, canais de texto, mensagens em tempo real (Socket.IO), histórico paginado.
_Plano detalhado a ser apresentado antes de começar._

---

## Backlog (ideias para depois)

- Teste **E2E com Playwright** (cadastro e login num navegador de verdade, rodando no CI).
- Recuperação de senha por e-mail.
- Login com Google/GitHub.
- Avatar do usuário.
- Tela de "sessões ativas" (ver e encerrar logins em outros dispositivos).
- Limpeza periódica de sessões revogadas/expiradas.
- Git hooks (husky + lint-staged) para rodar lint/format antes do commit.
- Badge do CI e screenshots no README.
