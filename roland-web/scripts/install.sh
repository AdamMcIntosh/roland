#!/usr/bin/env bash
# install.sh — First-time self-host setup for Roland Web on Linux (systemd).
#
# Usage:
#   curl -fsSL … | bash   # or clone repo first, then:
#   sudo ./roland-web/scripts/install.sh
#
# Creates: roland user, data/log dirs, .env template, systemd unit, logrotate.

set -euo pipefail

ROLAND_USER="${ROLAND_USER:-roland}"
ROLAND_GROUP="${ROLAND_GROUP:-roland}"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/roland}"
ROLAND_WEB_DIR="${ROLAND_WEB_DIR:-$INSTALL_ROOT/roland-web}"
DATA_DIR="${DATA_DIR:-/var/lib/roland-web}"
LOG_DIR="${LOG_DIR:-/var/log/roland-web}"
PORT="${PORT:-3000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() { echo "[install] $*"; }

if [[ "${EUID:-0}" -ne 0 ]]; then
  log "ERROR: run as root (sudo)"
  exit 1
fi

log "Creating system user $ROLAND_USER…"
if ! id "$ROLAND_USER" &>/dev/null; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$ROLAND_USER"
fi

log "Creating directories…"
mkdir -p "$INSTALL_ROOT" "$DATA_DIR/projects" "$DATA_DIR/state" "$LOG_DIR"
chown -R "$ROLAND_USER:$ROLAND_GROUP" "$DATA_DIR" "$LOG_DIR"

log "Installing app to $ROLAND_WEB_DIR…"
mkdir -p "$ROLAND_WEB_DIR"
rsync -a --delete \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude 'logs/' \
  --exclude 'node_modules/' \
  "$REPO_DIR/roland-web/" "$ROLAND_WEB_DIR/"

cd "$ROLAND_WEB_DIR"

log "Building Roland core and web app…"
cd "$REPO_DIR"
npm ci && npm run build
cd "$ROLAND_WEB_DIR"
npm ci
npm run build:core
npm run build
chown -R "$ROLAND_USER:$ROLAND_GROUP" "$ROLAND_WEB_DIR"

ENV_FILE="$ROLAND_WEB_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "Creating $ENV_FILE from .env.example — EDIT BEFORE FIRST START"
  cp .env.example "$ENV_FILE"
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
  PAT_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" "$ENV_FILE"
  sed -i "s|^PAT_ENCRYPTION_KEY=.*|PAT_ENCRYPTION_KEY=$PAT_KEY|" "$ENV_FILE"
  cat >> "$ENV_FILE" <<EOF

# Self-host paths (added by install.sh)
NODE_ENV=production
HOST=0.0.0.0
PORT=$PORT
DATA_DIR=$DATA_DIR
LOG_DIR=$LOG_DIR
EOF
  chown "$ROLAND_USER:$ROLAND_GROUP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "⚠ Set AUTH_PASSWORD and CURSOR_API_KEY in $ENV_FILE before starting"
else
  log ".env already exists — leaving unchanged"
fi

log "Installing systemd unit…"
sed "s|/opt/roland/roland-web|$ROLAND_WEB_DIR|g" \
  "$ROLAND_WEB_DIR/systemd/roland-web.service" \
  > /etc/systemd/system/roland-web.service
systemctl daemon-reload
systemctl enable roland-web.service

log "Installing logrotate config…"
cp "$ROLAND_WEB_DIR/deploy/logrotate.conf" /etc/logrotate.d/roland-web

log ""
log "════════════════════════════════════════════════════════════"
log "Install complete."
log ""
log "  1. Edit secrets:  nano $ENV_FILE"
log "     (AUTH_PASSWORD, CURSOR_API_KEY required)"
log ""
log "  2. Start:         systemctl start roland-web"
log "  3. Status:        systemctl status roland-web"
log "  4. Logs:          journalctl -u roland-web -f"
log "                    tail -f $LOG_DIR/access.log"
log ""
log "  Tailscale: bind to 0.0.0.0:$PORT — access via http://<tailscale-ip>:$PORT"
log "  Updates:   sudo $ROLAND_WEB_DIR/scripts/update.sh"
log "════════════════════════════════════════════════════════════"
