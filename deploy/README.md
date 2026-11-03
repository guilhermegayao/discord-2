# Deploy (Fase 7): uma VM gratuita da Oracle

Tudo roda numa VM só, em Docker:

| Serviço    | O que faz                                                 | Portas públicas                               |
| ---------- | --------------------------------------------------------- | --------------------------------------------- |
| `caddy`    | Site + proxy reverso com HTTPS automático (Let's Encrypt) | 80/tcp, 443/tcp, 443/udp                      |
| `server`   | API Nest + Socket.IO                                      | — (só pela rede interna)                      |
| `migrate`  | Aplica as migrations do Prisma e sai                      | —                                             |
| `postgres` | Banco                                                     | — (só pela rede interna)                      |
| `livekit`  | Voz e tela (SFU) com TURN embutido                        | 7881/tcp, 7882/udp, 3478/udp, 30000–30099/udp |

Endereços: o site em `https://SEU-NOME.duckdns.org` e o LiveKit em `wss://livekit.SEU-NOME.duckdns.org`.

## 1. Criar a VM (no site da Oracle)

1. Crie a conta em <https://www.oracle.com/cloud/free/>. **Região: Brazil East (São Paulo)**, que não muda depois. A Oracle pede cartão só para verificar; não ative o plano pago.
2. _Compute → Instances → Create instance_:
   - **Image**: Canonical Ubuntu 24.04 (aarch64).
   - **Shape**: _Ampere_ → `VM.Standard.A1.Flex`, **4 OCPUs e 24 GB** (o máximo gratuito). Se der _Out of host capacity_, tente 2 OCPUs / 12 GB ou outro horário.
   - **SSH keys**: _Paste public key_ e cole o conteúdo de `~/.ssh/discord2-oracle.pub`, que é a parte pública (a privada nunca sai do seu PC).
3. Anote o **IP público** da VM.

## 2. Abrir as portas (dois lugares!)

**a) Na Oracle**: _Networking → Virtual cloud networks → (sua VCN) → Security Lists → Default → Add Ingress Rules_, com origem `0.0.0.0/0`:

| Protocolo | Portas      |
| --------- | ----------- |
| TCP       | 80, 443     |
| UDP       | 443         |
| TCP       | 7881        |
| UDP       | 7882        |
| UDP       | 3478        |
| UDP       | 30000-30099 |

**b) No Ubuntu da VM**: a imagem da Oracle vem com um firewall (iptables) que bloqueia tudo além do SSH. Pela VM (`ssh -i ~/.ssh/discord2-oracle ubuntu@IP`):

```bash
for p in 80 443 7881; do sudo iptables -I INPUT 6 -p tcp --dport $p -j ACCEPT; done
for p in 443 7882 3478; do sudo iptables -I INPUT 6 -p udp --dport $p -j ACCEPT; done
sudo iptables -I INPUT 6 -p udp --dport 30000:30099 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Endereço (DuckDNS)

Em <https://www.duckdns.org> (login com o GitHub), crie o subdomínio e coloque o IP público da VM. O DuckDNS já responde também `livekit.SEU-NOME.duckdns.org` com o mesmo IP.

## 4. Docker e primeira subida (na VM)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # depois saia e entre de novo no SSH
git clone --depth 1 https://github.com/guilhermegayao/discord-2.git
cd discord-2/deploy
./setup-env.sh SEU-NOME.duckdns.org   # gera o .env com segredos aleatórios
docker compose pull
docker compose up -d
docker compose ps        # migrate: exited (0); os outros: running/healthy
docker compose logs caddy | grep -i certificate   # certificados emitidos
```

As imagens vêm do GitHub Container Registry (`ghcr.io/guilhermegayao/discord-2-*`), publicadas pelo CI a cada push na `main`. Como o repositório é público, elas já nascem públicas: a VM baixa sem login.

## 5. Atualizar

```bash
cd ~/discord-2 && git pull && cd deploy
docker compose pull && docker compose up -d
```

Para voltar a uma versão anterior, coloque `IMAGE_TAG=sha-abc1234` no `deploy/.env` (as tags aparecem na página da imagem) e rode `docker compose up -d`.

## Problemas comuns

- **O site não abre**: confira as portas nos **dois** lugares do passo 2 e se o DuckDNS aponta para o IP certo (`nslookup SEU-NOME.duckdns.org`).
- **Entra na voz, mas ninguém se ouve**: as portas de mídia (7881/tcp, 7882/udp) estão fechadas em algum dos dois lugares.
- **`docker compose pull` pede login**: alguma imagem ficou privada. Em _GitHub → seu perfil → Packages → (a imagem) → Package settings → Change visibility_, deixe como _Public_.
- **A Oracle pode recolher VMs gratuitas muito ociosas** (uso baixo de CPU, rede e memória por 7 dias). Se acontecer, os dados do volume se perdem: mantenha um backup do banco (Fase 7c).
