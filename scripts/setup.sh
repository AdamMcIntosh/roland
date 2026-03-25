#!/usr/bin/env bash
# setup.sh — One-command setup for Roland Code Orchestrator
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.sh | bash
#
# Or clone first and run locally:
#   bash scripts/setup.sh

set -euo pipefail

VERSION="0.1.5"
ROLAND_REPO="https://github.com/AdamMcIntosh/roland.git"
ROLAND_DIR="$HOME/.roland/roland"
ROLAND_CONFIG="$HOME/.roland/config.yaml"

# ── Colors ────────────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  CYAN='\033[0;36m'
  MAGENTA='\033[0;35m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' YELLOW='' RED='' CYAN='' MAGENTA='' BOLD='' RESET=''
fi

ok()   { printf "${GREEN}  ✓ %s${RESET}\n" "$1"; }
warn() { printf "${YELLOW}  ! %s${RESET}\n" "$1"; }
err()  { printf "${RED}  ✗ %s${RESET}\n" "$1"; }
step() { printf "\n${BOLD}${CYAN}── %s${RESET}\n" "$1"; }

confirm() {
  local msg="$1" default="${2:-y}"
  local prompt
  if [ "$default" = "y" ]; then prompt="[Y/n]"; else prompt="[y/N]"; fi
  printf "  %s %s " "$msg" "$prompt"
  read -r ans </dev/tty || ans=""
  ans="${ans:-$default}"
  case "$ans" in
    [Yy]*) return 0 ;;
    *) return 1 ;;
  esac
}

# ── Banner ────────────────────────────────────────────────────────────────────

printf "\n"
printf "${BOLD}${MAGENTA}╔═══════════════════════════════════════╗${RESET}\n"
printf "${BOLD}${MAGENTA}║        Roland Setup  v%s           ║${RESET}\n" "$VERSION"
printf "${BOLD}${MAGENTA}║  One-command Roland Code Orchestrator  ║${RESET}\n"
printf "${BOLD}${MAGENTA}╚═══════════════════════════════════════╝${RESET}\n"
printf "\n"

# ── Node.js check ─────────────────────────────────────────────────────────────

step "Checking environment"

if ! command -v node &>/dev/null; then
  err "Node.js is not installed."
  echo "  Download it from https://nodejs.org/ (v18+ required)"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js >= 18 is required. You have v$(node -v)."
  echo "  Download the latest LTS at https://nodejs.org/"
  exit 1
fi
ok "Node.js $(node -v)"

if ! command -v git &>/dev/null; then
  err "Git is not installed."
  exit 1
fi
ok "Git $(git --version | head -c 20)"

# ── Goose install/check ───────────────────────────────────────────────────────

step "Checking for Goose"

HAVE_GOOSE=false
if command -v goose &>/dev/null; then
  ok "Goose found ($(goose --version 2>/dev/null || echo 'unknown version'))"
  HAVE_GOOSE=true
else
  warn "Goose not found."
  if confirm "Install Goose now?"; then
    printf "  Installing Goose...\n"
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin" ]]; then
      # Windows — use PowerShell installer
      TMPDIR_GOOSE=$(mktemp -d)
      curl -fsSL "https://raw.githubusercontent.com/block/goose/main/download_cli.ps1" -o "$TMPDIR_GOOSE/download_cli.ps1"
      powershell.exe -ExecutionPolicy Bypass -File "$TMPDIR_GOOSE/download_cli.ps1"
      rm -rf "$TMPDIR_GOOSE"
    else
      # macOS/Linux — use shell installer
      curl -fsSL https://github.com/block/goose/releases/latest/download/download_cli.sh | bash
    fi
    # Re-check after install (reload PATH)
    hash -r 2>/dev/null
    export PATH="$HOME/.local/bin:$PATH"
    if command -v goose &>/dev/null; then
      ok "Goose installed successfully"
      HAVE_GOOSE=true
    else
      warn "Goose installed but not found in PATH. You may need to restart your terminal."
      warn "Continuing setup — configure Goose manually after restart."
    fi
  else
    warn "Skipping Goose. You can install it later from https://block.github.io/goose/"
  fi
fi

# ── OpenRouter API key ────────────────────────────────────────────────────────

step "OpenRouter API Key"
printf "  ${CYAN}Roland uses OpenRouter for model routing. Get a key at https://openrouter.ai/${RESET}\n"

API_KEY=""
ATTEMPTS=0

while [ "$ATTEMPTS" -lt 3 ]; do
  if [ "$ATTEMPTS" -eq 0 ]; then
    printf "  Enter your OpenRouter API key (or press Enter to skip): "
  else
    printf "  Try again (or press Enter to skip): "
  fi
  read -rs key </dev/tty || key=""
  printf "\n"

  if [ -z "$key" ]; then
    warn "No API key provided — skipping. Roland will not route models via OpenRouter."
    break
  fi

  printf "  Validating key...\n"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $key" \
    -H "HTTP-Referer: https://github.com/AdamMcIntosh/roland" \
    "https://openrouter.ai/api/v1/models" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    ok "API key validated"
    API_KEY="$key"
    break
  else
    err "Key appears invalid (HTTP $HTTP_CODE). Check the key and try again."
    ATTEMPTS=$((ATTEMPTS + 1))
  fi
done

if [ "$ATTEMPTS" -ge 3 ] && [ -z "$API_KEY" ]; then
  if ! confirm "Continue without a valid API key?"; then
    echo "  Setup cancelled."
    exit 0
  fi
  warn "Continuing without API key."
fi

# ── Clone or update Roland ────────────────────────────────────────────────────

step "Roland Installation"

mkdir -p "$HOME/.roland"

if [ -d "$ROLAND_DIR/.git" ]; then
  printf "  Updating existing clone at %s\n" "$ROLAND_DIR"
  if git -C "$ROLAND_DIR" pull --ff-only 2>/dev/null; then
    ok "Roland updated"
  else
    warn "git pull failed — continuing with existing clone."
  fi
else
  printf "  Cloning Roland into %s\n" "$ROLAND_DIR"
  if git clone "$ROLAND_REPO" "$ROLAND_DIR"; then
    ok "Roland cloned"
  else
    err "Clone failed."
    if ! confirm "Continue anyway?" "n"; then
      exit 1
    fi
  fi
fi

# ── Build Roland ──────────────────────────────────────────────────────────────

step "Building Roland"

printf "  Running npm install...\n"
if (cd "$ROLAND_DIR" && npm install); then
  ok "npm install complete"
else
  err "npm install failed."
  if ! confirm "Continue anyway?" "n"; then
    exit 1
  fi
fi

printf "  Running npm run build...\n"
if (cd "$ROLAND_DIR" && npm run build); then
  ok "Build complete"
else
  err "Build failed."
  if ! confirm "Continue anyway?" "n"; then
    exit 1
  fi
fi

# ── Configure Goose globally ──────────────────────────────────────────────────

if [ "$HAVE_GOOSE" = true ]; then
  step "Configuring Goose"

  # Detect config path — use 'goose info' if available, fall back to platform defaults
  GOOSE_CONFIG=""
  if command -v goose &>/dev/null; then
    GOOSE_CONFIG=$(goose info 2>/dev/null | grep "Config yaml:" | sed 's/.*Config yaml:\s*//' | tr -d '\r')
  fi

  # Fallback to platform-specific defaults
  if [ -z "$GOOSE_CONFIG" ] || [ "$GOOSE_CONFIG" = "" ]; then
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin" ]]; then
      GOOSE_CONFIG="$APPDATA/Block/goose/config/config.yaml"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
      GOOSE_CONFIG="$HOME/Library/Application Support/Block/goose/config/config.yaml"
    else
      GOOSE_CONFIG="$HOME/.config/goose/config.yaml"
    fi
  fi

  GOOSE_CONFIG_DIR=$(dirname "$GOOSE_CONFIG")
  ROLAND_DIST="${ROLAND_DIR}/dist/index.js"
  ROLAND_DIST_POSIX="${ROLAND_DIST//\\//}"

  printf "  Goose config: %s\n" "$GOOSE_CONFIG"
  mkdir -p "$GOOSE_CONFIG_DIR"

  if [ -f "$GOOSE_CONFIG" ]; then
    # Add Roland extension if not already present
    if grep -q "roland:" "$GOOSE_CONFIG" 2>/dev/null; then
      ok "Goose config already has Roland — skipping"
    else
      ROLAND_BLOCK="  roland:\n    name: Roland\n    type: stdio\n    cmd: node\n    args:\n      - \"${ROLAND_DIST_POSIX}\"\n    enabled: true\n    timeout: 300"
      # Insert inside the extensions block, before GOOSE_PROVIDER line
      if grep -q "^GOOSE_PROVIDER:" "$GOOSE_CONFIG" 2>/dev/null; then
        sed -i.bak "/^GOOSE_PROVIDER:/i\\${ROLAND_BLOCK}" "$GOOSE_CONFIG"
        rm -f "${GOOSE_CONFIG}.bak"
      elif grep -q "^extensions:" "$GOOSE_CONFIG" 2>/dev/null; then
        printf '\n%b\n' "$ROLAND_BLOCK" >> "$GOOSE_CONFIG"
      else
        printf '\nextensions:\n%b\n' "$ROLAND_BLOCK" >> "$GOOSE_CONFIG"
      fi
      ok "Added Roland extension to existing Goose config"
    fi

    # Set model to claude-haiku if still on a free/weak model
    if grep -q "GOOSE_MODEL:" "$GOOSE_CONFIG" 2>/dev/null; then
      CURRENT_MODEL=$(grep "GOOSE_MODEL:" "$GOOSE_CONFIG" | head -1 | sed 's/GOOSE_MODEL:\s*//' | tr -d '\r')
      printf "  Current model: %s\n" "$CURRENT_MODEL"
      if confirm "Switch to anthropic/claude-haiku-4.5 (recommended)?"; then
        sed -i.bak "s|GOOSE_MODEL:.*|GOOSE_MODEL: anthropic/claude-haiku-4.5|" "$GOOSE_CONFIG"
        rm -f "${GOOSE_CONFIG}.bak"
        ok "Model set to anthropic/claude-haiku-4.5"
      fi
    fi
  else
    # Write fresh global Goose config
    cat > "$GOOSE_CONFIG" <<GOOSE
# Goose global config — auto-generated by Roland setup
# Edit or re-run 'goose configure' to change provider/model settings.

GOOSE_PROVIDER: openrouter
GOOSE_MODEL: anthropic/claude-haiku-4.5
${API_KEY:+OPENROUTER_API_KEY: $API_KEY}

extensions:
  developer:
    name: Developer
    type: builtin
    enabled: true

  roland:
    name: Roland
    type: stdio
    cmd: node
    args:
      - "${ROLAND_DIST_POSIX}"
    enabled: true
    timeout: 300
GOOSE
    ok "Goose config written to $GOOSE_CONFIG"
  fi
fi

# ── Init current project ─────────────────────────────────────────────────────

step "Initialising current project"

TARGET_DIR="${1:-$(pwd)}"
printf "  Target: %s\n" "$TARGET_DIR"

if (cd "$ROLAND_DIR" && npm run init -- "$TARGET_DIR"); then
  ok "Project initialised"
else
  err "Init failed."
  if ! confirm "Continue anyway?"; then
    exit 1
  fi
fi

# ── Save config ──────────────────────────────────────────────────────────────

if [ -n "$API_KEY" ]; then
  step "Saving configuration"

  mkdir -p "$HOME/.roland"

  if [ -f "$ROLAND_CONFIG" ]; then
    # Merge key into existing config
    if grep -q "openrouter_api_key:" "$ROLAND_CONFIG" 2>/dev/null; then
      sed -i.bak "s|openrouter_api_key:.*|openrouter_api_key: \"$API_KEY\"|" "$ROLAND_CONFIG"
      rm -f "${ROLAND_CONFIG}.bak"
    elif grep -q "^goose:" "$ROLAND_CONFIG" 2>/dev/null; then
      sed -i.bak "/^goose:/a\\  openrouter_api_key: \"$API_KEY\"" "$ROLAND_CONFIG"
      rm -f "${ROLAND_CONFIG}.bak"
    else
      printf '\ngoose:\n  openrouter_api_key: "%s"\n' "$API_KEY" >> "$ROLAND_CONFIG"
    fi
  else
    cat > "$ROLAND_CONFIG" <<YAML
# Roland configuration
# Auto-generated by roland setup

goose:
  openrouter_api_key: "$API_KEY"
YAML
  fi
  ok "Config saved to $ROLAND_CONFIG"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

printf "\n"
printf "${BOLD}${GREEN}═══════════════════════════════════════${RESET}\n"
printf "${BOLD}${GREEN}  Roland setup complete!${RESET}\n"
printf "${BOLD}${GREEN}═══════════════════════════════════════${RESET}\n"
printf "\n"
printf "${BOLD}What was set up:${RESET}\n"
printf "  • Roland cloned/updated at ${CYAN}%s${RESET}\n" "$ROLAND_DIR"
printf "  • Current project initialised with agent configs and MCP settings\n"
if [ -n "$API_KEY" ]; then
  printf "  • OpenRouter API key saved to ${CYAN}%s${RESET}\n" "$ROLAND_CONFIG"
fi
printf "\n"
printf "${BOLD}Next steps:${RESET}\n"
printf "  1. Open this project in Cursor or VS Code\n"
printf "  2. Verify: ask your IDE agent to \"Use the health_check tool\"\n"
printf "     You should get: ${GREEN}status: healthy${RESET}\n"
printf "  3. Start a Goose session:\n"
printf "     ${CYAN}goose session${RESET}\n"
printf "  4. Try a recipe:\n"
printf "     ${CYAN}goose run --recipe ~/.roland/roland/goose/recipes/roland-plan-exec-rev-ex.yaml --task \"...\"${RESET}\n"
printf "\n"
printf "  Docs: https://github.com/AdamMcIntosh/roland\n"
printf "\n"
