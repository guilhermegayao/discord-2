#!/usr/bin/env sh
# Cria o deploy/.env com segredos aleatórios. Roda na VM, uma vez:
#   ./setup-env.sh seu-nome.duckdns.org
# Os segredos nunca aparecem na tela nem vão para o git.
set -eu
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo "O .env já existe; nada foi alterado (apague-o se quiser gerar de novo)." >&2
  exit 1
fi
if [ $# -ne 1 ]; then
  echo "Uso: ./setup-env.sh seu-nome.duckdns.org" >&2
  exit 1
fi

secret() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48; }

umask 077
cat > .env <<EOF
APP_DOMAIN=$1
IMAGE_PREFIX=ghcr.io/guilhermegayao/discord-2
IMAGE_TAG=latest
POSTGRES_USER=discord2
POSTGRES_DB=discord2
POSTGRES_PASSWORD=$(secret)
JWT_ACCESS_SECRET=$(secret)
LIVEKIT_API_KEY=discord2
LIVEKIT_API_SECRET=$(secret)
LIVEKIT_USE_EXTERNAL_IP=true
LIVEKIT_NODE_IP=
EOF
echo "deploy/.env criado para $1 (permissão só do seu usuário)."
