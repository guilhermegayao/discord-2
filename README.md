# discord-2

App de chat, voz e **compartilhamento de tela** no estilo Discord, feito para usar com amigos (inclusive quem usa iPhone) e como projeto de portfólio.

> 🚧 Em desenvolvimento. Veja o progresso e as decisões no [ROADMAP.md](ROADMAP.md).

## Stack

| Parte         | Tecnologias                                                               |
| ------------- | ------------------------------------------------------------------------- |
| Servidor      | NestJS 12, Prisma 7, PostgreSQL 17, Zod                                   |
| Web           | React 19, Vite 8, TypeScript                                              |
| Compartilhado | `@discord-2/shared`: schemas Zod e tipos usados por todos os apps         |
| Qualidade     | Vitest, Testing Library, supertest, ESLint, Prettier, GitHub Actions      |
| Em breve      | Socket.IO (chat), LiveKit (voz e tela), Electron (desktop), Expo (mobile) |

## Estrutura

```
discord-2/
├── apps/
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

```bash
docker compose up -d
```

```bash
npm run dev
```

Depois abra **http://localhost:5174**. A tela deve mostrar "Servidor: online" e "Banco: up".
O servidor também responde direto em **http://localhost:3100/health**.

> Na primeira execução, o Firewall do Windows pode pedir permissão para o Node.js. Permitir em redes privadas é suficiente.

### Portas (configuráveis no `.env`)

| Serviço    | Porta padrão |
| ---------- | ------------ |
| PostgreSQL | 5433         |
| Servidor   | 3100         |
| Web        | 5174         |

## Scripts

| Comando                     | O que faz                                  |
| --------------------------- | ------------------------------------------ |
| `npm run dev`               | Sobe shared (watch), servidor e web juntos |
| `npm test`                  | Roda os testes de todos os pacotes         |
| `npm run lint`              | ESLint em todo o monorepo                  |
| `npm run format`            | Formata com Prettier                       |
| `npm run typecheck`         | Checagem de tipos em todos os pacotes      |
| `npm run build`             | Build de produção                          |
| `npm run db:up` / `db:down` | Sobe ou derruba o Postgres                 |

O teste de integração com o banco real roda só com `DB_TESTS=1` (sempre ativo no CI):

```powershell
$env:DB_TESTS='1'; npm test -w @discord-2/server
```

## Problemas comuns

- **`failed to connect to the docker API`**: o Docker Desktop não está aberto. Abra-o e espere o ícone ficar verde.
- **Porta em uso**: mude a porta no `.env` (por exemplo `POSTGRES_PORT=5434`) e ajuste a `DATABASE_URL`.
- **Banco: down na tela**: confira se o container está `healthy` com `docker compose ps`.
