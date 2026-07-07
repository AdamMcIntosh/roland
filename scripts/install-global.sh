#!/usr/bin/env bash
# install-global.sh — Install Roland globally and activate MCP in Cursor.
#
# Run from the repo root:
#   bash scripts/install-global.sh
#
# What it does:
#   1. npm install + build (compiles dist/, copies agents/ + recipes/teams/)
#   2. npm install -g . so the `roland` binary is on your PATH
#   3. roland init --yes --skip-scaffold  → ~/.roland/.env template + MCP merge
#   4. roland doctor --fresh-check        → full install + loop readiness validation
#
# Then restart Cursor and run: roland init (interactive) to add CURSOR_API_KEY.

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; RESET='\033[0m'
step() { printf "\n${BOLD}${CYAN}── %s${RESET}\n" "$1"; }
ok()   { printf "${GREEN}  ✓ %s${RESET}\n" "$1"; }
warn() { printf "${YELLOW}  ⚠ %s${RESET}\n" "$1"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

step "Checking Node.js (requires 22+)"
NODE_MAJOR="$(node -p "process.version.slice(1).split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Node.js 22+ required (found $(node -v)). Install from https://nodejs.org/"
  exit 1
fi
ok "Node $(node -v)"

step "Installing dependencies"
npm install
ok "dependencies installed"

step "Building (dist/ + agents/ + recipes/teams/)"
npm run build
ok "build complete"

step "Installing the 'roland' binary globally"
npm install -g .
ok "roland is on your PATH ($(command -v roland || echo 'restart your shell if not found'))"

step "First-run scaffold (~/.roland/.env template + Cursor MCP)"
if roland init --yes --skip-scaffold --skip-mcp 2>/dev/null; then
  ok "init scaffold complete"
else
  warn "roland init failed — run manually after install"
fi

step "Activating in Cursor (~/.cursor/mcp.json)"
roland mcp-config --write || warn "mcp-config --write failed — run: roland doctor --fix"

step "Verifying (roland doctor --fresh-check)"
if roland doctor --fresh-check; then
  ok "all checks passed"
else
  warn "some checks failed — run: roland init  then  roland doctor --fix"
fi

printf "\n${BOLD}${GREEN}Done.${RESET} Next:\n"
printf "  1. ${BOLD}roland init${RESET}          — add CURSOR_API_KEY interactively\n"
printf "  2. Restart Cursor\n"
printf "  3. ${BOLD}roland doctor --fresh-check${RESET}\n"
printf "  4. ${BOLD}roland team \"your goal\"${RESET}\n\n"
