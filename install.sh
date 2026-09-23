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

ADMIN_TOKEN_VALUE="${ADMIN_TOKEN:-$(openssl rand -hex 24)}"
BRS_API_KEY_VALUE="${BRS_API_KEY:-}"
TELEGRAM_BOT_TOKEN_VALUE="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID_VALUE="${TELEGRAM_CHAT_ID:-}"
if [ "${NONINTERACTIVE:-0}" != "1" ] && [ -r /dev/tty ]; then
  if [ -z "$BRS_API_KEY_VALUE" ]; then printf 'BRSAPI key: ' >/dev/tty; IFS= read -r -s BRS_API_KEY_VALUE </dev/tty; printf '\n' >/dev/tty; fi
  if [ -z "$TELEGRAM_BOT_TOKEN_VALUE" ]; then printf 'Telegram bot token: ' >/dev/tty; IFS= read -r -s TELEGRAM_BOT_TOKEN_VALUE </dev/tty; printf '\n' >/dev/tty; fi
  if [ -z "$TELEGRAM_CHAT_ID_VALUE" ]; then printf 'Telegram chat ID: ' >/dev/tty; IFS= read -r TELEGRAM_CHAT_ID_VALUE </dev/tty; fi
fi
DATA_PROVIDER_VALUE="${DATA_PROVIDER:-mock}"
if [ -n "$BRS_API_KEY_VALUE" ]; then DATA_PROVIDER_VALUE="brsapi"; fi

umask 077
for value in "$BRS_API_KEY_VALUE" "$TELEGRAM_BOT_TOKEN_VALUE" "$TELEGRAM_CHAT_ID_VALUE"; do
  case "$value" in *$'\n'*|*$'\r'*) echo "Secrets cannot contain line breaks." >&2; exit 1;; esac
done
{
  printf 'PORT=3000\n'
  printf 'HOST_PORT=%s\n' "$APP_PORT"
  printf 'BIND_ADDRESS=%s\n' "$BIND_ADDRESS"
  printf 'APP_NAME=پایش خودکار بورس\n'
  printf 'ADMIN_TOKEN=%s\n' "$ADMIN_TOKEN_VALUE"
  printf 'POLL_INTERVAL_SECONDS=15\nMARKET_CACHE_SECONDS=150\nRETENTION_DAYS=90\nMARKET_TIMEZONE=Asia/Tehran\n'
  printf 'DATA_PROVIDER=%s\n' "$DATA_PROVIDER_VALUE"
  printf 'BRS_API_KEY=%s\n' "$BRS_API_KEY_VALUE"
  sed -n '/^BRS_BASE_URL=/,$p' "$INSTALL_DIR/.env.example" | grep -v -E '^(BRS_API_KEY|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|DB_PATH)='
  printf 'TELEGRAM_BOT_TOKEN=%s\nTELEGRAM_CHAT_ID=%s\nDB_PATH=/app/data/monitor.db\n' "$TELEGRAM_BOT_TOKEN_VALUE" "$TELEGRAM_CHAT_ID_VALUE"
} > "$INSTALL_DIR/.env"
mkdir -p "$INSTALL_DIR/data"
chmod 600 "$INSTALL_DIR/.env"
docker compose -f "$INSTALL_DIR/compose.yaml" --env-file "$INSTALL_DIR/.env" up -d --build

echo
echo "Installed in $INSTALL_DIR"
echo "Admin token: $ADMIN_TOKEN_VALUE"
echo "Dashboard is bound to $BIND_ADDRESS:$APP_PORT"
echo "Safe remote access: ssh -L ${APP_PORT}:127.0.0.1:${APP_PORT} USER@VPS_IP"
