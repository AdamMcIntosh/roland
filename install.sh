#!/usr/bin/env sh
# RCO Phase 4 — curl-based installer (macOS/Linux).
# Usage: curl -fsSL https://raw.githubusercontent.com/OWNER/roland/main/install.sh | sh
# Or: curl -fsSL https://raw.githubusercontent.com/OWNER/roland/main/install.sh | sh -s -- /opt/rco
# Default install dir: ~/.local/share/roland (or $RCO_INSTALL_DIR)

set -e
RCO_VERSION="${RCO_VERSION:-0.1.0}"
GITHUB_REPO="${GITHUB_REPO:-AdamMcIntosh/roland}"
INSTALL_DIR="${1:-${RCO_INSTALL_DIR:-$HOME/.local/share/roland}}"
BIN_DIR="${RCO_BIN_DIR:-$HOME/.local/bin}"
ZIP_URL="https://github.com/${GITHUB_REPO}/releases/download/v${RCO_VERSION}/roland-plugin-${RCO_VERSION}.zip"

log() { echo "[RCO install] $*"; }
log "Install directory: $INSTALL_DIR"
log "Binary directory: $BIN_DIR"
log "Downloading v${RCO_VERSION} from GitHub..."

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL -o "${INSTALL_DIR}/roland-plugin.zip" "$ZIP_URL" || {
    log "Download failed. If release not found, build locally: npm run build-plugin-zip"
    exit 1
  }
else
  log "curl not found. Install curl or download manually: $ZIP_URL"
  exit 1
fi

log "Extracting..."
unzip -o -q "${INSTALL_DIR}/roland-plugin.zip" -d "$INSTALL_DIR"
rm -f "${INSTALL_DIR}/roland-plugin.zip"

# Optional: symlink if node is available and we have a CLI entry
if [ -f "${INSTALL_DIR}/plugin.js" ]; then
  log "Plugin extracted to $INSTALL_DIR/plugin.js"
fi

log "Done. Add to PATH if needed: export PATH=\"$BIN_DIR:\$PATH\""
