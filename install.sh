#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/pirdel2002/bourse-monitor.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/bourse-monitor}"
APP_PORT="${PORT:-3000}"
BIND_ADDRESS="${BIND_ADDRESS:-127.0.0.1}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: curl ... | sudo env ... bash" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y git docker.io docker-compose-v2 openssl ca-certificates
fi
systemctl enable --now docker

if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

existing_value() { if [ -f "$INSTALL_DIR/.env" ]; then sed -n "s/^$1=//p" "$INSTALL_DIR/.env" | tail -n 1; fi; }
ADMIN_TOKEN_VALUE="${ADMIN_TOKEN:-$(existing_value ADMIN_TOKEN)}"
APP_ENCRYPTION_KEY_VALUE="${APP_ENCRYPTION_KEY:-$(existing_value APP_ENCRYPTION_KEY)}"
BRS_API_KEY_VALUE="${BRS_API_KEY:-$(existing_value BRS_API_KEY)}"
TELEGRAM_BOT_TOKEN_VALUE="${TELEGRAM_BOT_TOKEN:-$(existing_value TELEGRAM_BOT_TOKEN)}"
TELEGRAM_CHAT_ID_VALUE="${TELEGRAM_CHAT_ID:-$(existing_value TELEGRAM_CHAT_ID)}"
CLOUDFLARE_TUNNEL_TOKEN_VALUE="${CLOUDFLARE_TUNNEL_TOKEN:-$(existing_value CLOUDFLARE_TUNNEL_TOKEN)}"
if [ -z "$ADMIN_TOKEN_VALUE" ]; then ADMIN_TOKEN_VALUE="$(openssl rand -hex 24)"; fi
if [ -z "$APP_ENCRYPTION_KEY_VALUE" ]; then APP_ENCRYPTION_KEY_VALUE="$(openssl rand -hex 32)"; fi
if [ "${NONINTERACTIVE:-0}" != "1" ] && [ -r /dev/tty ]; then
  if [ -z "$BRS_API_KEY_VALUE" ]; then printf 'BRSAPI key: ' >/dev/tty; IFS= read -r -s BRS_API_KEY_VALUE </dev/tty; printf '\n' >/dev/tty; fi
  if [ -z "$TELEGRAM_BOT_TOKEN_VALUE" ]; then printf 'Telegram bot token: ' >/dev/tty; IFS= read -r -s TELEGRAM_BOT_TOKEN_VALUE </dev/tty; printf '\n' >/dev/tty; fi
  if [ -z "$TELEGRAM_CHAT_ID_VALUE" ]; then printf 'Telegram chat ID: ' >/dev/tty; IFS= read -r TELEGRAM_CHAT_ID_VALUE </dev/tty; fi
  if [ -z "$CLOUDFLARE_TUNNEL_TOKEN_VALUE" ]; then printf 'Cloudflare Tunnel token (optional; Enter to skip): ' >/dev/tty; IFS= read -r -s CLOUDFLARE_TUNNEL_TOKEN_VALUE </dev/tty; printf '\n' >/dev/tty; fi
fi
DATA_PROVIDER_VALUE="${DATA_PROVIDER:-mock}"
if [ -n "$BRS_API_KEY_VALUE" ]; then DATA_PROVIDER_VALUE="brsapi"; fi

umask 077
for value in "$BRS_API_KEY_VALUE" "$TELEGRAM_BOT_TOKEN_VALUE" "$TELEGRAM_CHAT_ID_VALUE" "$CLOUDFLARE_TUNNEL_TOKEN_VALUE"; do
  case "$value" in *$'\n'*|*$'\r'*) echo "Secrets cannot contain line breaks." >&2; exit 1;; esac
done
{
  printf 'PORT=3000\n'
  printf 'HOST_PORT=%s\n' "$APP_PORT"
  printf 'BIND_ADDRESS=%s\n' "$BIND_ADDRESS"
  printf 'APP_NAME=پایش خودکار بورس\n'
  printf 'ADMIN_TOKEN=%s\n' "$ADMIN_TOKEN_VALUE"
  printf 'APP_ENCRYPTION_KEY=%s\n' "$APP_ENCRYPTION_KEY_VALUE"
  printf 'POLL_INTERVAL_SECONDS=15\nMARKET_CACHE_SECONDS=150\nRETENTION_DAYS=90\nMARKET_TIMEZONE=Asia/Tehran\n'
  printf 'DATA_PROVIDER=%s\n' "$DATA_PROVIDER_VALUE"
  printf 'BRS_API_KEY=%s\n' "$BRS_API_KEY_VALUE"
  sed -n '/^BRS_BASE_URL=/,$p' "$INSTALL_DIR/.env.example" | grep -v -E '^(BRS_API_KEY|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|DB_PATH|CLOUDFLARE_TUNNEL_TOKEN)='
  printf 'TELEGRAM_BOT_TOKEN=%s\nTELEGRAM_CHAT_ID=%s\nDB_PATH=/app/data/monitor.db\n' "$TELEGRAM_BOT_TOKEN_VALUE" "$TELEGRAM_CHAT_ID_VALUE"
  printf 'CLOUDFLARE_TUNNEL_TOKEN=%s\n' "$CLOUDFLARE_TUNNEL_TOKEN_VALUE"
} > "$INSTALL_DIR/.env"
mkdir -p "$INSTALL_DIR/data"
chmod 600 "$INSTALL_DIR/.env"
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN_VALUE" ]; then
  docker compose -f "$INSTALL_DIR/compose.yaml" -f "$INSTALL_DIR/compose.tunnel.yaml" --env-file "$INSTALL_DIR/.env" up -d --build
else
  docker compose -f "$INSTALL_DIR/compose.yaml" --env-file "$INSTALL_DIR/.env" up -d --build
fi

echo
echo "Installed in $INSTALL_DIR"
echo "Admin token: $ADMIN_TOKEN_VALUE"
echo "Dashboard is bound to $BIND_ADDRESS:$APP_PORT"
echo "Safe remote access: ssh -L ${APP_PORT}:127.0.0.1:${APP_PORT} USER@VPS_IP"
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN_VALUE" ]; then echo "Cloudflare Tunnel enabled. Public hostname origin must be http://app:3000"; fi
