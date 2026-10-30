# ROADMAP — discord-2

> **Fonte da verdade do projeto.** Toda sessão nova começa lendo este arquivo.
> Ideias novas entram na seção [Backlog](#backlog-ideias-para-depois) e só são feitas depois da fase atual.

## Visão

App no estilo Discord para portfólio e uso real com amigos. O foco é **compartilhar tela**, inclusive com quem usa iPhone.
Prioridade: PC (web + desktop) primeiro, mobile depois. Custo: o mínimo possível (planos gratuitos).

## Status das fases

| Fase | Entrega                                                                   | Status                            |
| ---- | ------------------------------------------------------------------------- | --------------------------------- |
| 0    | Fundação: monorepo, Postgres, `/health`, tela inicial, lint, testes, CI   | ✅ Concluída                      |
| 1    | Contas: cadastro, login, sessão persistente com refresh token             | ✅ Concluída                      |
| 2    | Servidores e chat: canais de texto, mensagens em tempo real, paginação    | ✅ Concluída                      |
| 3    | Social: convites, membros, presença, "digitando...", DMs                  | ✅ Concluída                      |
| 4    | Voz com LiveKit                                                           | ✅ Concluída                      |
| 5    | Compartilhamento de tela no navegador (getDisplayMedia)                   | ✅ Concluída                      |
| 6a   | App desktop Electron: seletor próprio de tela/janela, instalador `.exe`   | ✅ Concluída                      |
| 6b   | Áudio do sistema no app sem eco (módulo nativo do Windows)                | ✅ Concluída (falta teste manual) |
| 7    | Deploy gratuito (back, banco, LiveKit Cloud)                              | —                                 |
| 8    | Mobile com Expo (incluindo tela no iOS via ReplayKit/Broadcast Extension) | —                                 |

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

## Fase 4 — Voz ✅ (28/10/2026)

### O que foi feito

- **Infra**: LiveKit `v1.13.10` no `docker-compose.yml`, configurado **inteiro pelo `.env`** (`LIVEKIT_CONFIG` montado pelo Compose).
  - Mídia numa **porta UDP só** (7892) + TCP de reserva (7891); sinalização na 7890.
  - O webhook aponta para o Nest no host (`host.docker.internal`).
  - Está pronto para levar à VM da Fase 7.
- **Banco**: canais agora são `TEXT`, `VOICE` (e `DM`). Canal de voz não tem mensagens. O servidor mantém pelo menos um canal de **texto**.
- **Servidor**:
  - `POST /api/channels/:id/voice-token`: token LiveKit de **10 min**, sala = id do canal, identidade = id do usuário, **só microfone** (`canPublishSources: microphone`). Só para membros.
  - `POST /api/livekit/webhook`: **assinatura conferida sobre o corpo cru**. Entradas e saídas atualizam um registro em memória e emitem `voice:state` para o servidor.
  - `GET /api/guilds/:id/voice-states` para quem abre o app depois. Ao subir, o servidor **sincroniza com o LiveKit**.
  - Quem sai ou é expulso do servidor **cai da voz**. Apagar um canal de voz ou o servidor **encerra a sala**. Quem entrar sem ser membro (token antigo) é removido.
- **Web**:
  - Canais de voz na lista com quem está em cada um. No canal em que você está, a lista é ao vivo, com **anel verde em quem fala** e 🔇 em quem está mutado.
  - **Painel de voz**: mutar, ensurdecer (também muta o microfone), escolher microfone e saída, sair.
  - A conexão continua ao navegar por canais de texto e DMs. Ao sair da conta, desconecta.
  - Mensagens claras para: microfone bloqueado (dá para ouvir mesmo assim), outra aba assumiu a sessão, removido do canal, sala encerrada, servidor de voz fora do ar.
- **Testes (231 no total)**:
  - shared: 31;
  - server: 118, sendo 13 de voz: token decodificado e conferido, webhook assinado/adulterado, eventos por socket, expulsão e encerramento;
  - web: 82, sendo 12 de voz com uma **sala LiveKit falsa**.
- **Testado no navegador com o LiveKit real e duas contas**:
  - o servidor sincronizou com o LiveKit;
  - o Gui entrou e a Ana (fora da voz) o viu pelo webhook → socket;
  - a Ana entrou e os dois se viram na mesma sala;
  - cada um saiu e a lista atualizou dos dois lados.
  - **O áudio em si não foi testado por mim**: o navegador embutido do app não tem microfone. O app mostrou o aviso de microfone bloqueado corretamente.

### Decisões tomadas

| Decisão                                                | Motivo                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Nest emite o token**, o LiveKit só confere           | O LiveKit não conhece nossos usuários. O token diz quem é (id), onde pode entrar (canal) e o que pode transmitir (só microfone).          |
| **Webhook como fonte de "quem está na voz"**           | É o LiveKit que sabe quem está conectado. Confiar no cliente dizendo "entrei" seria manipulável.                                          |
| **Corpo cru no webhook** (`express.raw` só nessa rota) | A assinatura é um hash dos bytes exatos. Interpretar o JSON antes mudaria os bytes e a verificação falharia.                              |
| **Quem fala só para quem está na sala**                | Avisar "fulano falando" a todo o servidor geraria tráfego constante. Quem está fora vê quem está no canal; quem está dentro vê quem fala. |
| **Uma porta UDP**                                      | Faixas grandes de portas UDP no Docker Desktop do Windows são lentas. O LiveKit multiplexa tudo numa porta.                               |
| **`VoiceProvider` no topo da área logada**             | A voz não cai ao trocar de página (como no Discord), e o logout desconecta.                                                               |
| **Estado da sala lido em eventos, não no render**      | O lint (`react-hooks/refs`) pegou a leitura do `ref` da sala durante o render. Agora os eventos do LiveKit atualizam um estado.           |

### Imprevistos encontrados

- O `prisma migrate dev` continua não interativo aqui; a migration do `VOICE` foi gerada com `migrate diff`.
- O lint pegou dois problemas de React: ler `ref` durante o render e buscar dispositivos de áudio **durante o render** (passou para `useEffect`).
- Depois de **sair da voz por vontade própria**, o aviso antigo do microfone continuava na tela; corrigido.
- Num comando confuso do git criei um _stash_ por engano. Conferi que era cópia idêntica do que já estava commitado e removi.
- Os testes da sala falsa precisaram de um gancho (`nextRoom.setup`) para simular microfone bloqueado e falha de conexão, porque `vi.spyOn` no protótipo não pega campos de instância.

### Pendências e observações

- **Teste de áudio real com você**: duas abas (ou dois navegadores) no mesmo PC, de **fone de ouvido** para não dar microfonia.
- Presença de voz e registro de quem está na voz são em memória (com várias instâncias, Redis).
- Webhooks podem chegar fora de ordem em casos raros; o registro é idempotente, mas não reordena eventos.

---

## Fase 5 — Compartilhamento de tela no navegador ✅ (28/10/2026)

### O que foi feito

- **Servidor**:
  - O token de voz passa a permitir `screen_share` e `screen_share_audio` (ainda sem câmera).
  - Os webhooks `track_published`/`track_unpublished` da tela ligam e desligam um **🔴 "ao vivo"** no estado de voz, então **quem está fora da chamada também vê quem transmite**.
  - A sincronização ao subir recupera esse estado do LiveKit.
- **Web**:
  - **Botão 🖥️ "Compartilhar tela"** no painel de voz, com três qualidades (todas em `apps/web/src/voice/screenShare.ts`):
    - **Vídeo/jogo (padrão)**: 1080p a 30 fps, `contentHint: motion`, até 4 Mbps;
    - **Texto/código**: 1080p até 15 fps, `contentHint: detail`, até 2,5 Mbps;
    - **Economia**: 720p a 15 fps, até 1,2 Mbps.
  - Cada qualidade envia também uma **camada menor** (simulcast) para quem tem internet ruim.
  - Áudio da aba (Chrome/Edge) ou do sistema ao compartilhar a tela inteira (Windows). A própria aba do app não aparece no seletor, evitando o "espelho infinito".
  - **Página do canal de voz** (`/channels/:guildId/voice/:channelId`): cartões de quem está na sala, 🔴 AO VIVO, botão **Assistir** e a tela grande com **tela cheia**. Mostra também uma miniatura da **sua** transmissão.
  - **Assistir é opcional**: o app conecta com `autoSubscribe: false` e só recebe a tela (e o áudio dela) de quem você escolheu assistir. A voz de todos chega sempre.
  - Detecta o botão "Parar compartilhamento" do próprio navegador e quando quem você assiste para. Fechar o seletor sem escolher não mostra erro.
- **Testes (245 no total)**:
  - shared: 31;
  - server: 121, com 3 novos do "ao vivo" pelo webhook;
  - web: 93, com 11 novos de transmissão: qualidades, assistir opcional, paradas, cancelar, sem suporte, tela cheia.
- **Testado no navegador**: clicar no canal de voz entra e abre a página dele; o menu de qualidade abre com "Vídeo/jogo" marcado; ao pedir a tela, o navegador embutido do app **bloqueou a captura** (ele não captura tela nem microfone) e o app tratou isso sem erro. **A captura e a imagem são conferidas por você no Chrome/Edge.**

### Decisões tomadas

| Decisão                                     | Motivo                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Assistir opcional** (assinatura manual)   | É o que mais pesa na banda: cada pessoa assistindo a 1080p30 recebe vários Mbps. Isso importa muito para a VM gratuita da Fase 7. |
| **Qualidade padrão "Vídeo/jogo"**           | Escolha do Guilherme: o grupo vai compartilhar mais jogos.                                                                        |
| **Números de qualidade num arquivo só**     | O refinamento de qualidade fica para o fim do projeto; tudo está em `screenShare.ts`.                                             |
| **🔴 pelo webhook do servidor**             | Quem está fora da voz também precisa saber que alguém está ao vivo, e só o servidor recebe esse aviso para todos.                 |
| **Áudio da tela pelo mesmo caminho da voz** | Respeita o ensurdecer e a escolha de saída de áudio. O `<video>` fica mudo.                                                       |

### Imprevistos encontrados

- **Um commit entrou com erro de lint**: um `new Map()` sem tipo virou `Map<any, any>`. Corrigido num commit de ajuste. Desde então, o comando de commit **só roda se lint e tipos passarem**.
- O lint pegou `navigator.mediaDevices.getDisplayMedia` sendo passado como valor (método solto); a checagem passou a ser um `typeof`.
- A sala falsa dos testes passou a simular **publicações** (fonte + `setSubscribed`), para testar que a tela só é recebida ao assistir. Confirmado com teste de mutação.

### Pendências e observações

- **Testado pelo Guilherme (28/10/2026)**: transmissão, 🔴 AO VIVO e "Assistir" funcionando entre duas contas.
  - **Bug encontrado e corrigido**: com a janela maximizada, a barra do palco (⛶ e "Parar de assistir") ficava cortada, porque o palco encolhia para caber com os cartões.
  - **Qualidade da imagem ruim no teste**; causas identificadas (ver backlog, "Refinamento de qualidade").
- Compartilhar uma **janela** não leva o áudio dela em nenhum navegador → Fase 6 (Electron).
- Firefox compartilha sem áudio; o Safari assiste normalmente.

---

## Fase 6a — App desktop Electron ✅ (28/10/2026)

### O que foi feito

- **Novo pacote `apps/desktop`** (Electron 44, CommonJS):
  - A janela carrega o front web (em dev, `http://localhost:5174`; dá para trocar com a variável `DISCORD2_APP_URL`).
  - Janela segura: `contextIsolation`, `sandbox` e sem `nodeIntegration`. A página só vê o que o `preload` expõe em `window.desktop`.
  - Navegação presa ao app: links de fora abrem no navegador padrão (só `http`/`https`); permissões (microfone, captura de tela, tela cheia, copiar) só para a origem do app.
  - Uma instância só: abrir de novo traz a janela existente para frente.
- **Seletor próprio de tela/janela**:
  - O Electron intercepta o "compartilhar tela" (`setDisplayMediaRequestHandler`), lista telas e janelas com miniatura e ícone (`desktopCapturer`) e manda para o front pela ponte.
  - O front mostra um modal no estilo do app, com abas **Telas/Janelas**; duplo clique compartilha direto; Esc ou Cancelar desiste sem erro.
  - A **própria janela do app não aparece** na lista (evita o "espelho infinito"), nem janelas sem imagem.
  - O processo principal só aceita de volta um id que ele mesmo ofereceu, e o pedido expira em 2 minutos.
  - No navegador comum nada muda: sem `window.desktop`, o seletor não aparece.
- **Instalador `.exe`** com electron-builder (NSIS): instala só para o usuário, deixa escolher a pasta e cria atalho na área de trabalho. O ícone é gerado por um script sem dependências (`npm run icon -w @discord-2/desktop`).
- **CI**: novo job em `windows-latest` que roda os testes do desktop, gera o instalador e guarda o `.exe` como artefato por 14 dias.
- **Testes (275 no total)**: shared 31; server 121; web 99, com 6 novos do seletor; desktop 24, cobrindo navegação, permissões, filtro de fontes, pedidos do seletor e canais IPC.
- **Testado aqui**: o instalador foi gerado (≈115 MB), o pacote contém só `dist/*.js` e `package.json`, e o app empacotado abre a janela "discord-2". **O fluxo de compartilhar pelo seletor é conferido por você.**

### Decisões tomadas

| Decisão                                                 | Motivo                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dividir em 6a e 6b** (escolha do Guilherme)           | O áudio do sistema do Electron (`loopback`) captura **tudo** que sai no PC, inclusive a voz da chamada: quem assiste ouviria o próprio eco. Fone não resolve. Ver 6b. |
| **O app carrega o front por URL**, em vez de embutir    | Uma versão só do front para navegador e app; atualizar o site atualiza o app. Depois da Fase 7, a URL padrão vira a do deploy.                                        |
| **Seletor feito no React**, não numa janela do Electron | Fica com a cara do app e é testável com Testing Library. O Electron só fornece a lista e recebe a escolha.                                                            |
| **`preload` repete os nomes dos canais IPC**            | Com `sandbox`, o preload não pode importar arquivos do projeto. Um teste garante que os nomes batem e que o preload só importa `electron`.                            |
| **Sem assinatura de código**                            | Certificado é pago. O Windows SmartScreen avisa na primeira execução ("Mais informações → Executar assim mesmo"); está no README.                                     |

### Imprevistos encontrados

- O `npm install` num workspace novo não salvou as dependências na primeira vez (de novo); rodar outra vez resolveu.
- `import.meta` não existe em CommonJS: os testes do desktop usam `__dirname`.
- **O jogo não aparecia no seletor** (teste do Guilherme com The Last of Us Part II):
  - Primeiro suspeito: o seletor escondia janelas sem miniatura. Elas passaram a aparecer com "Sem prévia", mas o jogo continuou fora da lista.
  - Causa real: em **tela cheia exclusiva**, o jogo se minimiza ao perder o foco, e o Chromium não lista janelas minimizadas (o Windows nem as desenha). Resolvido no jogo, no modo janela/sem bordas. A aba Janelas agora explica isso.
- O `.gitignore` ignorava qualquer pasta `build/`, inclusive a do ícone do instalador; ganhou uma exceção para `apps/desktop/build/`.

### Pendências e observações

- **Teste manual do Guilherme**: instalar o `.exe`, compartilhar uma janela pelo seletor e assistir de outra conta.
- O app instalado só funciona com o projeto rodando (`npm run dev`) até a Fase 7 dar uma URL pública.
- Sem atualização automática por enquanto (precisa de um lugar para publicar versões; fica para depois da Fase 7).

---

## Fase 6b — Áudio do sistema sem eco ✅ (29/10/2026)

### O que foi feito

- **Módulo nativo em C++** (`apps/desktop/native`, node-addon-api, ~200 linhas):
  - Usa a captura **por processo** do Windows (`ActivateAudioInterfaceAsync` com `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE`): grava o som do PC **menos o processo do app e todos os filhos dele**.
  - Como o áudio da chamada toca num processo filho do Electron, **a voz de quem está na chamada não volta para quem assiste** (sem eco).
  - Roda numa thread própria e entrega pedaços de ~10 ms (48 kHz, estéreo) ao JavaScript por uma `ThreadSafeFunction`.
  - Usa N-API, que tem ABI estável: o mesmo `.node` funciona no Node (testes) e no Electron, sem recompilar para cada versão.
- **Caminho do áudio**:
  - O processo principal liga a captura quando o seletor volta com "Incluir som do PC" e entrega à página um `MessagePort`. O preload o repassa como mensagem da janela, porque um `MessagePort` não atravessa o `contextBridge`.
  - Na página, um **AudioWorklet** recebe os pedaços numa fila (reserva de 40 ms, no máximo 100 ms de atraso, descartando o mais antigo) e gera uma faixa de áudio.
  - A faixa é publicada no LiveKit como **áudio da tela** (estéreo, qualidade de música): quem assiste ouve pelo mesmo caminho do áudio de aba do navegador.
  - Parar a tela (botão nosso ou do sistema), sair da voz ou fechar o app **fecha o canal**, e fechar o canal desliga a captura. O inverso também vale.
- **Seletor**: opção **🔊 Incluir som do PC** (marcada por padrão) quando o Windows suporta (build 20348+, Windows 11). Sem suporte, explica e sugere o navegador.
- **Instalador e CI**: o `.node` vai fora do `.asar` (`asarUnpack`), e `dist:desktop` compila o módulo antes de empacotar. O job do Windows compila o módulo e roda o teste de fumaça dele.
- **Testes (295 no total)**: shared 31; server 121; web 111, com 4 novos da fila de áudio, 5 do som do PC no `VoiceProvider` e 2 da opção no seletor; desktop 34, com 9 novos (sessão de captura, suporte, carregamento e um teste de fumaça do módulo real, que só roda no Windows).
- **Testado aqui**:
  - **Exclusão comprovada com um tom puro de 1 kHz**: excluindo outro processo, o tom aparece com amplitude 0,400 (a do arquivo); excluindo o processo que toca, ele some (0,002 a 0,004, só o ruído do resto do PC).
  - **No app empacotado**: o módulo carrega de dentro do instalador, o seletor oferece o som do PC, o canal chega à página, o worklet gera a faixa e o tom tocado por outro programa aparece com pico exato em 1000 Hz.
  - **Falta você conferir**: a transmissão de verdade entre duas contas, ouvindo o som do PC e confirmando que a sua voz não volta.

### Decisões tomadas

| Decisão                                                | Motivo                                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Módulo próprio em C++**, em vez de biblioteca pronta | Pequeno, sem dependência de terceiros abandonável, e é um bom exemplo de integração nativa para o portfólio.                 |
| **Excluir a árvore do processo principal**             | O áudio do Electron toca num processo filho (serviço de áudio); excluir só a janela não bastaria.                            |
| **Áudio via `MessagePort` + AudioWorklet**             | O áudio não passa pela thread principal da página (onde fica o React) e chega a cada 10 ms sem travar a interface.           |
| **Fila com teto de 100 ms**                            | A placa de som e o navegador têm relógios diferentes; sem teto, o atraso cresceria aos poucos durante uma transmissão longa. |
| **PCM 16 bits pedido ao Windows**                      | É o formato que a captura por processo aceita com certeza; a conversão para float é feita no próprio módulo.                 |
| **Autoplay liberado só na janela do app**              | O `AudioContext` nasce depois de várias esperas, longe do clique, e sem isso começaria pausado.                              |

### Imprevistos encontrados

- **O primeiro teste de exclusão enganava**: o script de teste excluía a si mesmo, e o processo que tocava o som era filho dele, então também ficava excluído. Ao mesmo tempo, o som de fundo do PC (uma live aberta) mascarava as medidas de volume. Solução: um tom puro de 1 kHz medido por correlação, e um processo "irmão" como controle.
- **Eco só ao transmitir a tela inteira** (teste do Guilherme, 30/10/2026):
  - O servidor do LiveKit mostrou uma faixa de áudio da tela mesmo num app sem o módulo nativo: ao escolher uma **tela**, o Chromium anexa sozinho o som do PC **completo** (com as vozes). Com janela ele não consegue, por isso não ecoava.
  - Correção: dentro do app, a captura pede `audio: false`; o único áudio da tela é o do módulo nativo. Um teste garante isso.
  - O app instalado ainda era a versão de 28/10, por isso o seletor não oferecia o som do PC.
- Funções de ponte entre threads no C++ não podem usar o objeto (`this`): mensagens na fila podem chegar depois de ele ser coletado. O módulo usa um callback único, sem estado.
- `Set-Content -Encoding utf8` do PowerShell 5.1 grava BOM no arquivo; ele foi removido. Edições de arquivo continuam só pela ferramenta de edição ou por Python.
- O crash nativo raro dos testes do servidor no Windows (`0xC0000409`, ver Fase 2) apareceu de novo, sem relação com esta fase. O CI no Linux passa.

### Pendências e observações

- **Teste manual do Guilherme**: transmitir com som do PC e ouvir de outra conta, sem eco.
- Jogos com anti-cheat podem bloquear a captura de áudio; nesse caso só a imagem vai.
- Compilar o instalador na própria máquina exige o **Visual Studio Build Tools** (instalado em 29/10/2026).

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
- **Fase 4:** WebRTC e por que um SFU (LiveKit) em vez de P2P; token de acesso com permissões (grants); webhooks assinados e verificação sobre o corpo cru; fonte da verdade (servidor de mídia) vs. estado derivado; UDP/TCP, ICE e o IP anunciado; refs vs. estado no React; dublês de bibliotecas de mídia nos testes.
- **Fase 5:** `getDisplayMedia` e limites por navegador; simulcast e adaptive stream; `contentHint` (motion vs detail); taxa de bits vs resolução vs fps; assinatura seletiva de faixas para economizar banda; Fullscreen API.
- **Fase 6a:** processos do Electron (main, preload, renderer); `contextIsolation`, `sandbox` e a superfície de ataque de um app desktop; IPC e validar quem envia; permissões por origem; empacotamento e instalador (NSIS, asar); assinatura de código e SmartScreen; build no CI em outro sistema operacional.
- **Fase 6b:** módulos nativos (N-API e ABI estável); threads e como chamar JavaScript de outra thread; COM e APIs assíncronas do Windows; áudio digital (taxa de amostragem, PCM vs float, canais intercalados); fila circular e deriva de relógio; AudioWorklet e a thread de áudio; `MessagePort` e transferência de objetos; como provar algo com um experimento de controle.

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
- **Refinamento de qualidade no fim do projeto** (pedido do Guilherme): ajustar voz (codec, supressão de ruído, ganho) e compartilhamento de tela (resolução, fps, taxa de bits por qualidade, codec como VP9/AV1), medindo com uso real. O que já sabemos do teste da Fase 5:
  - **Tela**:
    - Compartilhar a tela inteira com o próprio app visível gera o "espelho infinito", o pior caso para o codificador. No uso real, compartilhar a janela do jogo ou outro monitor.
    - O _adaptive stream_ manda uma camada menor quando o vídeo aparece pequeno. Para quem está assistindo, forçar a melhor camada (`setVideoQuality(HIGH)`).
    - Usar **VP9** na tela (comprime melhor, principalmente texto) e subir a taxa de bits do "Vídeo/jogo".
    - Testar entre dois PCs: no mesmo PC, transmitir e assistir dividem o processador.
  - **Ruído do microfone**: a supressão do navegador é básica. O Krisp do LiveKit só funciona no LiveKit Cloud (vamos auto-hospedar). Opção gratuita: **RNNoise** (filtro com IA, código aberto) via AudioWorklet, no navegador e no Electron. Junto: ganho automático e _push-to-talk_.
- Tela: "quem está assistindo"/contador de espectadores, _picture-in-picture_, desenhar sobre a tela, gravação.
- Voz: _push-to-talk_, volume individual por pessoa, câmera, chat de texto dentro do canal de voz.
- Testar voz com um amigo no mesmo Wi-Fi (`LIVEKIT_NODE_IP` = IP da rede local + `vite --host`).
- Recuperação de senha por e-mail.
- Login com Google/GitHub.
- Avatar do usuário.
- Tela de "sessões ativas" (ver e encerrar logins em outros dispositivos).
- Limpeza periódica de sessões revogadas/expiradas.
- Git hooks (husky + lint-staged) para rodar lint/format antes do commit.
- Badge do CI e screenshots no README.
