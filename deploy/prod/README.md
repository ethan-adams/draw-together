# Deploy LiveBoard to a server

Host the whole thing on one small Linux box — a cheap VPS, a spare machine, a
Raspberry Pi. You get real multiplayer (two gateway nodes sharing boards through
Redis, durable in Postgres) behind Caddy with automatic HTTPS. No Kubernetes
required; that's for the scale story, not for running one instance.

Requirements: a server with a public IP, and a domain you can point at it.

## One command on a fresh Ubuntu box

SSH in, then:

```bash
export LIVEBOARD_DOMAIN=board.example.com
curl -fsSL https://raw.githubusercontent.com/ethan-adams/liveboard/main/deploy/prod/bootstrap.sh | sudo -E bash
```

That installs Docker, turns on a firewall (SSH + web only) and automatic
security updates, clones the repo, generates a database password, and starts the
stack. Point `board.example.com`'s DNS (an A record) at the server's IP first so
Caddy can get a certificate on start. Give it ~30s, then open the URL.

## Manual, step by step

On any host with Docker + the Compose plugin:

```bash
git clone https://github.com/ethan-adams/liveboard.git
cd liveboard/deploy/prod
cp .env.example .env
# edit .env: set LIVEBOARD_DOMAIN and a strong POSTGRES_PASSWORD
docker compose --env-file .env up -d --build
```

Open ports **80** and **443** to the world and leave the rest closed.

## Updating

```bash
cd /opt/liveboard && git pull
cd deploy/prod && docker compose --env-file .env up -d --build
```

Boards survive updates and reboots — Postgres and Caddy's certificates live in
named Docker volumes, and every service restarts on its own.

## What's running

| Service | Role |
|---------|------|
| `caddy` | HTTPS + load balancer across the gateway nodes |
| `gw1`, `gw2` | Stateless gateway nodes (WebSocket + static UI) |
| `redis` | Cross-node fan-out (pub/sub) |
| `postgres` | Durable board op log (named volume `pgdata`) |

Two gateway nodes on one box is the same design that scales to many nodes on a
cluster — it just proves the cross-node path is real in production, too.
