# Imagens do servidor. Build a partir da raiz do monorepo:
#   docker build -f apps/server/Dockerfile --target server -t discord-2-server .
#   docker build -f apps/server/Dockerfile --target migrate -t discord-2-migrate .
# Funciona em amd64 e arm64 (a VM da Oracle é ARM).

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/prisma.config.ts apps/server/
# O schema entra já aqui porque o postinstall do servidor roda `prisma generate`.
COPY apps/server/prisma apps/server/prisma
# Só os workspaces do servidor (+ a raiz, que tem o TypeScript).
RUN npm ci -w @discord-2/shared -w @discord-2/server --include-workspace-root

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @discord-2/shared && npm run build -w @discord-2/server

# Roda as migrations e sai (precisa da CLI do Prisma, que é dependência de dev).
FROM build AS migrate
WORKDIR /app/apps/server
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# Imagem final: só dependências de produção e o código compilado.
FROM node:24-bookworm-slim AS server
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
# --ignore-scripts: o postinstall (prisma generate) não é necessário, o cliente
# gerado já está compilado em dist. O argon2 usa binário pré-compilado.
RUN npm ci --omit=dev --ignore-scripts -w @discord-2/shared -w @discord-2/server \
  && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/dist apps/server/dist
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.SERVER_PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/server/dist/main.js"]
