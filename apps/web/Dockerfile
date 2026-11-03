# Site (build estático do Vite) servido pelo Caddy, que também é o proxy
# reverso com HTTPS automático. Build a partir da raiz do monorepo:
#   docker build -f apps/web/Dockerfile -t discord-2-web .

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci -w @discord-2/shared -w @discord-2/web --include-workspace-root
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @discord-2/shared && npm run build -w @discord-2/web

FROM caddy:2.10-alpine
COPY --from=build /app/apps/web/dist /srv
# O Caddyfile vem do deploy/ (montado pelo compose), para mudar sem rebuild.
