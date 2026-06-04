#!/usr/bin/env bash
# update.sh — Pull latest Roland, rebuild, and restart the systemd service.
#
# Usage (from repo root or roland-web/):
#   sudo ./roland-web/scripts/update.sh
#
# Environment overrides:
#   ROLAND_REPO_DIR   — git repo root (default: auto-detect)
#   ROLAND_WEB_DIR    — roland-web install dir (default: /opt/roland/roland-web)
#   ROLAND_SERVICE    — systemd unit name (default: roland-web)

set -euo pipefail

ROLAND_WEB_DIR="${ROLAND_WEB_DIR:-/opt/roland/roland-web}"
ROLAND_SERVICE="${ROLAND_SERVICE:-roland-web}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLAND_REPO_DIR="${ROLAND_REPO_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

log() { echo "[update] $(date -Iseconds) $*"; }

if [[ "${EUID:-0}" -ne 0 ]]; then
  log "ERROR: run as root (sudo) so the service can restart"
  exit 1
fi

log "Repo:       $ROLAND_REPO_DIR"
log "Install:    $ROLAND_WEB_DIR"
log "Service:    $ROLAND_SERVICE"

cd "$ROLAND_REPO_DIR"

BEFORE="$(git rev-parse --short HEAD)"
log "Pulling latest (was $BEFORE)…"
git pull --ff-only
AFTER="$(git rev-parse --short HEAD)"
log "Now at $AFTER"

log "Building Roland core…"
npm ci
npm run build

log "Syncing core into roland-web…"
cd "$ROLAND_REPO_DIR/roland-web"
npm ci
npm run build:core
npm run build

PREV_VERSION=""
if [[ -f "$ROLAND_WEB_DIR/package.json" ]]; then
  PREV_VERSION="$(node -pe "require('$ROLAND_WEB_DIR/package.json').version" 2>/dev/null || echo '?')"
fi

if [[ "$ROLAND_WEB_DIR" != "$ROLAND_REPO_DIR/roland-web" ]]; then
  log "Syncing build to $ROLAND_WEB_DIR…"
  rsync -a --delete \
    --exclude '.env' \
    --exclude 'data/' \
    --exclude 'logs/' \
    --exclude 'node_modules/' \
    "$ROLAND_REPO_DIR/roland-web/" "$ROLAND_WEB_DIR/"
  cd "$ROLAND_WEB_DIR"
  npm ci --omit=dev
  npm run build
fi

NEW_VERSION="$(node -pe "require('./package.json').version")"
log "Version: $PREV_VERSION → $NEW_VERSION"

log "Restarting $ROLAND_SERVICE…"
systemctl restart "$ROLAND_SERVICE"
sleep 2

if systemctl is-active --quiet "$ROLAND_SERVICE"; then
  log "✓ Service is active"
  curl -sf "http://127.0.0.1:${PORT:-3000}/health" && log "Health check OK" || {
    log "WARN: health check failed (service may still be starting)"
  }
else
  log "ERROR: service failed to start — check: journalctl -u $ROLAND_SERVICE -n 50"
  exit 1
fi

log "Update complete ($BEFORE → $AFTER, v$NEW_VERSION)"
