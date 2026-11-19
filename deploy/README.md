# Deploy (Fase 7): uma VPS só

Produção: **https://discord2-gui.duckdns.org** (VPS KingHost em São Paulo, Ubuntu 24.04, 2 vCPU, 4 GB).

Tudo roda na VPS, em Docker:

| Serviço    | O que faz                                                 | Portas públicas                               |
| ---------- | --------------------------------------------------------- | --------------------------------------------- |
| `caddy`    | Site + proxy reverso com HTTPS automático (Let's Encrypt) | 80/tcp, 443/tcp, 443/udp                      |
| `server`   | API Nest + Socket.IO                                      | — (só pela rede interna)                      |
| `migrate`  | Aplica as migrations do Prisma e sai                      | —                                             |
| `postgres` | Banco                                                     | — (só pela rede interna)                      |
| `livekit`  | Voz e tela (SFU) com TURN embutido                        | 7881/tcp, 7882/udp, 3478/udp, 30000–30099/udp |

Endereços: o site em `https://SEU-NOME.duckdns.org` e o LiveKit em `wss://livekit.SEU-NOME.duckdns.org`. Os passos abaixo servem para qualquer VPS x86 com Ubuntu; entre parênteses, como foi na KingHost.

## 1. Criar a VPS

- **Sistema**: Ubuntu 24.04, sem painel (cPanel, Plesk etc.). Na KingHost: _Ubuntu 24.04_ com a tecnologia _Docker_, que já vem instalado.
- **Acesso**: por **chave SSH**, não por senha. Gere a chave no seu PC e cole só a parte **pública** no painel:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/discord2-vps -C discord2-vps
```

- Anote o **IP público**. Entrar: `ssh -i ~/.ssh/discord2-vps root@IP`.

## 2. Segurança básica (na VPS)

Só login por chave (o arquivo `00-` vem antes do `50-cloud-init.conf`, e no `sshd` vale o primeiro valor):

```bash
cat > /etc/ssh/sshd_config.d/00-discord2.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl reload ssh
```

Firewall com só as portas do projeto (o SSH primeiro, para não se trancar fora):

```bash
ufw allow 22/tcp
ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp
ufw allow 7881/tcp; ufw allow 7882/udp; ufw allow 3478/udp; ufw allow 30000:30099/udp
ufw --force enable
```

Se o provedor tiver um firewall próprio no painel, libere as mesmas portas lá (na KingHost não foi preciso).

## 3. Endereço (DuckDNS)

Em <https://www.duckdns.org> (login com o GitHub; ele pede reCAPTCHA), crie o subdomínio e coloque o IP da VPS. O DuckDNS já responde também `livekit.SEU-NOME.duckdns.org` com o mesmo IP. O **token** que aparece na página é segredo: não compartilhe.

## 4. Primeira subida (na VPS)

```bash
curl -fsSL https://get.docker.com | sh   # só se o Docker não veio instalado
cd /opt && git clone --depth 1 https://github.com/guilhermegayao/discord-2.git
cd discord-2/deploy
./setup-env.sh SEU-NOME.duckdns.org   # gera o .env com segredos aleatórios
docker compose pull
docker compose up -d
docker compose ps        # migrate: exited (0); os outros: running/healthy
docker compose logs caddy | grep -i "certificate obtained"
```

As imagens vêm do GitHub Container Registry (`ghcr.io/guilhermegayao/discord-2-*`, x86), publicadas pelo CI a cada push na `main`. Como o repositório é público, elas já nascem públicas: a VPS baixa sem login.

## 5. Atualizar

```bash
cd /opt/discord-2 && git pull && cd deploy
docker compose pull && docker compose up -d
```

Para voltar a uma versão anterior, coloque `IMAGE_TAG=sha-abc1234` no `deploy/.env` (as tags aparecem na página da imagem) e rode `docker compose up -d`.

## Problemas comuns

- **O site não abre**: confira o firewall (`ufw status`) e o do painel do provedor, e se o DuckDNS aponta para o IP certo (`nslookup SEU-NOME.duckdns.org`).
- **Entra na voz, mas ninguém se ouve**: as portas de mídia (7881/tcp, 7882/udp) estão fechadas em algum firewall.
- **O servidor reinicia em loop**: veja o motivo com `docker compose logs server --tail 30`.
- **`docker compose pull` pede login**: alguma imagem ficou privada. Em _GitHub → seu perfil → Packages → (a imagem) → Package settings → Change visibility_, deixe como _Public_.
