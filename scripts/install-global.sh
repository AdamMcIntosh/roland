#!/usr/bin/env bash
# install-global.sh — Install Roland globally and activate the PM Team in Cursor.
#
# Run from the repo root:
#   bash scripts/install-global.sh
#
# What it does:
#   1. npm install + build (compiles dist/, copies agents/ + recipes/teams/)
#   2. npm install -g . so the `roland` binary is on your PATH
#   3. roland mcp-config --write  → merges the "roland" server into ~/.cursor/mcp.json
#   4. roland doctor              → verifies the install
#
# Then restart Cursor. Roland's PM tools become available in every project.

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
step() { printf "\n${BOLD}${CYAN}── %s${RESET}\n" "$1"; }
ok()   { printf "${GREEN}  ✓ %s${RESET}\n" "$1"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

step "Installing dependencies"
npm install
ok "dependencies installed"

step "Building (dist/ + agents/ + recipes/teams/)"
npm run build
ok "build complete"

step "Installing the 'roland' binary globally"
npm install -g .
ok "roland is on your PATH ($(command -v roland || echo 'restart your shell if not found'))"

step "Activating in Cursor (~/.cursor/mcp.json)"
roland mcp-config --write

step "Verifying"
roland doctor || true

printf "\n${BOLD}${GREEN}Done. Restart Cursor, then call get_pm_playbook to start PM-ing.${RESET}\n"
