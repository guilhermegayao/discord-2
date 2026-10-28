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
| 2    | Servidores e chat: canais de texto, mensagens em tempo real, paginação    | ✅ Concluída |
| 3    | Social: convites, membros, presença, "digitando...", DMs                  | ✅ Concluída |
| 4    | Voz com LiveKit                                                           | ⏳ Próxima   |
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

## Fase 2 — Servidores e chat ✅ (28/10/2026)

### O que foi feito

- **Banco**: models `Guild`, `Member` (papel `OWNER`/`MEMBER`), `Channel` (`TEXT`) e `Message` (até 2000 caracteres), com índice `(channel_id, id DESC)` para o histórico.
- **`shared`**: schemas de servidor, canal, mensagem e paginação. A interface `ServerToClientEvents`, compartilhada, tipa os eventos do Socket.IO nos dois lados.
- **Servidor (REST)**:
  - `/api/guilds` (listar, criar, ver, renomear, apagar);
  - `/api/guilds/:id/channels`;
  - `/api/channels/:id` (renomear, apagar);
  - `/api/channels/:id/messages` (listar paginado, enviar);
  - `/api/messages/:id` (editar, apagar).
  - Criar servidor cria também o dono e o `#geral` numa transação.
  - Regras: quem não é membro recebe **404**. O dono gerencia o servidor e os canais. O autor edita a mensagem. Autor ou dono apagam. Todo servidor mantém pelo menos um canal.
  - **Paginação por cursor** com o id UUID v7 (`?before=<id>&limit=50`); busca N+1 para saber se há mais páginas.
  - **Rate limit por usuário** (5 mensagens a cada 5 s). Para isso, o `AuthGuard` passou a rodar antes do throttler.
- **Servidor (tempo real)**: gateway Socket.IO em `/api/socket.io`. O token é validado no _handshake_ (sem token válido, a conexão é recusada). Cada socket entra numa sala por servidor e numa sala do próprio usuário. Os eventos são emitidos **depois** de gravar no banco.
- **Web**:
  - Layout estilo Discord: barra de servidores, lista de canais e chat. Rotas `/channels/:guildId/:channelId`.
  - **TanStack Query** guarda os dados. O socket só atualiza o cache, e as telas não sabem que ele existe. Em toda reconexão, o app recarrega o que está na tela.
  - Histórico com rolagem para cima que **mantém a posição** da tela.
  - **Envio otimista com `nonce`**: a mensagem aparece na hora e é reconciliada com a resposta HTTP ou com o eco do socket, o que chegar primeiro, sem duplicar. Se falhar, dá para "Tentar de novo" ou "Descartar".
  - Editar e apagar mensagens; criar servidor e canal em modais.
- **Testes (142 no total)**:
  - shared: 26;
  - server: 75, incluindo 7 de tempo real com `socket.io-client` de verdade e paginação nas bordas;
  - web: 41, com MSW e um socket falso.
- **Testado no navegador**: duas abas, mensagem e canal novo aparecendo na outra na hora; 121 mensagens paginadas sem duplicar e sem a tela pular.

### Decisões tomadas

| Decisão                                                       | Motivo                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Guild` no código**, "Servidor" na tela                     | "Server" já é o backend e o `http.Server`. É o mesmo nome que o Discord usa na API.                                                               |
| **Escrita por REST, distribuição por Socket.IO**              | Validação, auth, rate limit e testes já existem no REST. O socket só avisa. O cliente não envia eventos (`ClientToServerEvents` vazio).           |
| **Cursor = id UUID v7**                                       | Estável quando chegam mensagens novas, usa índice e não precisa de coluna extra. Com `OFFSET`, a página "anda" e fica lenta com histórico grande. |
| **404 para quem não é membro**                                | Não confirma a existência de servidores, canais ou mensagens para quem está de fora.                                                              |
| **Socket no caminho `/api/socket.io`**                        | Passa pelo mesmo proxy do Vite (com `ws: true`) e, em produção, pelo mesmo domínio da API.                                                        |
| **Token do socket como função** (`auth: cb => cb({ token })`) | A cada reconexão vai o access token atual. Se o handshake falhar por token expirado, o cliente renova a sessão e tenta uma vez.                   |
| **`null` no cache = servidor apagado**                        | Remover a query do cache não bastava: a tela aberta continuava vendo dados antigos. O `null` é um marcador explícito.                             |
| **Funções de cache puras** (`upsertMessage` etc.)             | Testáveis sem React. A mesma função atende a resposta HTTP e o evento do socket, e por isso a ordem de chegada não importa.                       |

### Imprevistos encontrados

- **Bug real encontrado por teste:** apagar o servidor aberto (em outra aba) deixava a tela presa nele. A causa era o `removeQueries`, que não avisa quem já está observando a query. Corrigido com o marcador `null` e confirmado com um teste de mutação.
- **Bug real de ordenação:** "meus servidores" ordenava por `joinedAt`, que tem precisão de milissegundo. Dois servidores no mesmo ms vinham em ordem aleatória. Isso apareceu como um teste instável (falhava raramente). Agora o id desempata, com um teste **determinístico** que falha sem a correção.
- **Crash nativo intermitente nos testes do servidor (Windows):** raramente (~2 em 40 rodadas), um worker do Vitest morre com o código `0xC0000409` (_stack buffer overrun_), ou seja, falha dentro de um módulo nativo. Suspeitos: `argon2` (nativo) ou o WebSocket. Não reproduz sob demanda. **Próximo passo, se voltar a aparecer:** rodar a suíte em loop com `argon2` trocado por `@node-rs/argon2` (binário pronto, sem node-gyp) para ver se some. No CI (Linux) nunca apareceu.
- O `removeAllListeners()` na limpeza do socket apagaria também os listeners internos (o retry do token). Com o `StrictMode` montando duas vezes, isso quebraria em dev. Agora o efeito remove só o que registrou.
- Accessible name: o `#` dos canais é `aria-hidden`, então o nome lido por leitores de tela (e usado nos testes) é só "geral".
- O PowerShell estragou de novo dois comandos de substituição (aspas e `$1`). Regra: editar arquivos só com o editor, nunca com scripts no PowerShell.

### Pendências e observações

- Um socket já conectado continua aceito depois que o access token dele expira; isso só é revalidado na reconexão. Aceitável por agora.
- Um único servidor Node: para várias instâncias, o Socket.IO vai precisar do adapter Redis.
- Telas estreitas (< 700 px) escondem a lista de canais. A navegação mobile de verdade é da Fase 8.
- Na Fase 3, entrar num servidor por convite deve chamar `addUserToGuild` no gateway (já existe) e emitir `guild:created` para o usuário.

---

## Fase 3 — Social ✅ (28/10/2026)

### O que foi feito

- **Banco**: tabela `invites` (código curto, usos, expiração). `channels` agora também guarda **DMs** (`type: DM`, sem servidor, com `channel_participants` e uma `dm_key` única por par de pessoas).
- **Convites**: qualquer membro gera um link (`/invite/<código>`) de 1 dia, 7 dias ou sem prazo. O dono lista e revoga. A prévia mostra o servidor e o nº de membros. Aceitar duas vezes não duplica. Convite expirado ou revogado tem a mesma resposta de inexistente.
- **Membros**: lista com papel e online/offline. Um membro pode sair; o dono expulsa (e não pode sair nem se expulsar). Quem sai ou é expulso **sai das salas do socket na hora**.
- **Presença**: contador de sockets por usuário no gateway. Online com pelo menos uma aba aberta. Offline só depois de `PRESENCE_GRACE_MS` (5 s) sem nenhuma, para não "piscar" num F5.
- **"Digitando..."**: primeiro evento enviado pelo cliente (`typing:start`). O servidor valida formato, frequência (1 a cada 2 s por canal) e acesso, e repassa só para os outros membros. O cliente envia no máximo a cada 3 s. O aviso some em 6 s ou quando a mensagem dessa pessoa chega.
- **DMs**: abertas pela lista de membros (💬), só entre quem divide algum servidor. Reaproveitam tudo do chat (paginação, envio otimista, edição). Os eventos vão só para os dois participantes. Ficam em `/channels/@me`.
- **Web**:
  - página de convite;
  - modal "Convidar pessoas" com botão de copiar;
  - coluna de membros (online/offline, com expulsar e abrir DM);
  - indicador de digitando;
  - área de mensagens diretas;
  - o fluxo **deslogado → login/cadastro → volta ao convite**.
- **Testes (204 no total)**:
  - shared: 29;
  - server: 105, incluindo **12 de tempo real com sockets de verdade** (presença com várias abas e F5, digitando, convite, saída e DM);
  - web: 70.
- **Testado no navegador com duas contas ao mesmo tempo:**
  - Gui em `localhost` e Ana em `[::1]`, origens diferentes e portanto cookies separados.
  - Convite: deslogada → cadastro → volta ao convite → entrar.
  - Os dois online na lista, "Ana está digitando…" aparecendo e sumindo, DM em tempo real.
  - Ao fechar a aba da Ana, ela continuou online por ~5 s e depois ficou offline.

### Decisões tomadas

| Decisão                                           | Motivo                                                                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DM = canal sem servidor**                       | Mensagens, paginação, edição e envio otimista funcionam igual, sem código duplicado. O TypeScript apontou cada lugar que assumia "todo canal tem servidor".                                                                            |
| **`AccessModule` separado**                       | O gateway passou a precisar das regras de acesso (para o "digitando"), e o módulo de chat já dependia do gateway. Um módulo próprio evita a dependência circular.                                                                      |
| **Presença em memória + prazo de 5 s**            | Simples para um servidor só. Com várias instâncias, vai precisar de Redis (anotado no backlog). O prazo evita o "pisca" no F5.                                                                                                         |
| **"Digitando" pelo socket, não pela API**         | É efêmero: não vai para o banco, e uma requisição HTTP para isso seria desperdício. O servidor limita e confere acesso.                                                                                                                |
| **Convite expirado = 404**                        | Não revela se o código existiu. Códigos de 8 caracteres aleatórios (48 bits) e rate limit de 20/min nas rotas de convite dificultam chutar.                                                                                            |
| **Destino pós-login validado** (`redirectTarget`) | Só aceita caminhos internos (`/...`), nunca `//site` ou `https://...`: evita _open redirect_.                                                                                                                                          |
| **Estado só do cliente no TanStack Query**        | Presença e "digitando" ficam no mesmo cache. O `queryFn` devolve o que já está guardado, para que o `invalidateQueries()` da reconexão não apague o que os eventos preencheram. Na reconexão a presença é zerada, para valer a da API. |

### Imprevistos encontrados

- **Bug real encontrado por teste:** os **guards globais do Nest também rodam nos eventos do WebSocket**. O `AuthGuard` tentava ler o header HTTP, que não existe ali, e quebrava; nenhum "digitando" funcionava. Agora os dois guards globais valem só para HTTP (o socket já é autenticado no handshake).
- Um teste ("ignora canal sem acesso") **passava por acaso** enquanto o bug acima existia, porque nada funcionava. Depois da correção, confirmei com um teste de mutação (removendo a checagem de acesso) que ele de fato protege.
- **Iniciais erradas:** "Ana (teste)" virava "A(". Agora a função usa a primeira letra ou número de cada palavra (com teste).
- `prisma migrate dev` para no aviso de índice único e o terminal daqui não é interativo. A migration foi gerada com `prisma migrate diff` e aplicada com `migrate deploy`.
- Errei um `git add` (citei um arquivo já removido e o git cancelou tudo), e dois commits ficaram com conteúdo trocado. Como não tinham sido enviados, refiz com `git reset --soft` num commit só, que compila.
- Para testar duas contas no mesmo navegador: `127.0.0.1` não responde (o Vite escuta só em IPv6), mas `http://[::1]:5174` funciona como segunda origem.

### Pendências e observações

- O dono não pode sair; transferir a posse do servidor fica para depois.
- A lista de membros não pagina (ok para grupos de amigos; rever se crescer).
- A presença e o "digitando" são por instância do servidor (ver Redis no backlog).
- O crash nativo raro nos testes no Windows (Fase 2) não apareceu nesta fase.

---

## Fase 4 — Voz (próxima)

Escopo previsto: canais de voz com LiveKit (local via Docker em dev).
_Plano detalhado a ser apresentado antes de começar._

---

## Decisões já tomadas para fases futuras

- **Fase 7: hospedar o próprio LiveKit numa VM gratuita** (decidido em 28/10/2026), em vez de depender do LiveKit Cloud.
  - Motivo: o plano gratuito do LiveKit Cloud tem cerca de 50 GB/mês de banda de saída, e **compartilhar tela consome isso rápido**.
  - Candidata: camada _Always Free_ da Oracle Cloud (VM ARM, muito tráfego de saída). **Conferir limites e regras na hora**: pede cartão no cadastro, só para verificação.
  - A VM vai precisar de domínio/subdomínio, HTTPS e o TURN embutido do LiveKit. O servidor Nest e o Postgres podem ficar na mesma VM.
  - Consequência para a Fase 4: a configuração do LiveKit (`livekit.yaml`, chaves, portas, webhook) é feita para ser levada para a VM, toda via variáveis de ambiente.
- **Fase 8: compartilhamento de tela no iPhone** provavelmente exigirá o Apple Developer Program (pago, anual). Confirmar valores e alternativas antes de começar.

---

## Tópicos para estudo (explicação completa no fim do projeto)

> A pedido do Guilherme, os tópicos de estudo/entrevista são guardados aqui e explicados todos juntos quando o projeto terminar.

- **Fase 0:** monorepo e workspaces; ESM vs CommonJS; schema como fonte da verdade (Zod); teste de unidade vs integração; proxy de dev vs CORS; health check (liveness/readiness, 200 vs 503); CI reproduzível ("funciona na minha máquina").
- **Fase 1:** hash de senha (argon2id) vs hash de token (SHA-256); access token vs refresh token; onde guardar token no front (memória, localStorage, cookie httpOnly; XSS e CSRF); rotação com detecção de reuso; ataques de timing e enumeração de usuários; seguro por padrão (guard global); MSW vs mock de `fetch`; teste de mutação; Web Locks e corrida entre abas.
- **Fase 2:** paginação por cursor vs OFFSET; UUID v7; REST para escrita e WebSocket para distribuição; rooms do Socket.IO e escala horizontal (adapter Redis); UI otimista e reconciliação com `nonce`; transações; 404 vs 403; cache como fonte da tela (TanStack Query); testes instáveis (flaky) e como transformá-los em testes determinísticos; ordem dos guards no Nest.
- **Fase 3:** presença (contagem de conexões, prazo contra "pisca"); eventos efêmeros vs persistidos; dependência circular entre módulos e como quebrar; modelagem de DM como canal (union types e o compilador apontando os casos); guards globais em HTTP vs WebSocket; open redirect; rate limit contra força bruta de códigos; testes que passam "por acaso" e como a mutação revela; testar dois usuários com origens diferentes.

---

## Backlog (ideias para depois)

- Teste **E2E com Playwright** (cadastro e login num navegador de verdade, rodando no CI).
- Indicador de mensagens não lidas e menções.
- Markdown e links clicáveis nas mensagens.
- Anexos, reações, busca e histórico de edições.
- Adapter Redis do Socket.IO (várias instâncias do servidor).
- Reordenar canais arrastando.
- Transferir a posse de um servidor.
- Limite de usos por convite; papéis e permissões além de dono/membro.
- Bloquear usuário; status personalizado ("ausente", "não perturbe").
- Notificações (navegador/desktop) para DMs e menções.
- Investigar o crash nativo raro dos testes no Windows (ver Fase 2).
- Recuperação de senha por e-mail.
- Login com Google/GitHub.
- Avatar do usuário.
- Tela de "sessões ativas" (ver e encerrar logins em outros dispositivos).
- Limpeza periódica de sessões revogadas/expiradas.
- Git hooks (husky + lint-staged) para rodar lint/format antes do commit.
- Badge do CI e screenshots no README.
