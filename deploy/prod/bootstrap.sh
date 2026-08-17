#!/usr/bin/env bash
# Bring Draw up on a fresh Ubuntu server (22.04 / 24.04) from nothing:
# installs Docker, turns on a basic firewall + automatic security updates,
# clones the repo, generates a Postgres password, and starts the production
# stack behind Caddy with automatic HTTPS.
#
# Run as root (or with sudo) on the server:
#
#   export DRAW_DOMAIN=board.example.com
#   curl -fsSL https://raw.githubusercontent.com/ethan-adams/draw-together/main/deploy/prod/bootstrap.sh | sudo -E bash
#
# Point DRAW_DOMAIN's DNS (an A record) at this server's public IP first,
# so Caddy can obtain a certificate the moment it starts.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ethan-adams/draw-together.git}"
APP_DIR="${APP_DIR:-/opt/draw-together}"
: "${DRAW_DOMAIN:?set DRAW_DOMAIN=your.domain first}"

echo "==> Installing Docker + basics"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw unattended-upgrades
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
	> /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

echo "==> Firewall: SSH + web only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Automatic security updates"
systemctl enable --now unattended-upgrades

echo "==> Fetching Draw into ${APP_DIR}"
if [ -d "$APP_DIR/.git" ]; then
	git -C "$APP_DIR" pull --ff-only
else
	git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR/deploy/prod"

if [ ! -f .env ]; then
	echo "==> Generating .env"
	cat > .env <<EOF
DRAW_DOMAIN=${DRAW_DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
EOF
fi

echo "==> Building + starting the stack"
docker compose --env-file .env up -d --build

echo
echo "==> Done. Draw is coming up at https://${DRAW_DOMAIN}"
echo "    First-boot certificate issuance takes ~30s. Redeploy later with:"
echo "    cd ${APP_DIR} && git pull && cd deploy/prod && docker compose --env-file .env up -d --build"
