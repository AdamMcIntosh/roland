#!/bin/sh
# Entrypoint for Roland Web container.
#
# Local development
#   Mount your roland-web/.env at /app/.env:
#     docker run -v $(pwd)/roland-web/.env:/app/.env:ro ...
#     # or via docker compose (see DEPLOYMENT.md)
#   This script sources it automatically before starting the server.
#
# Railway production
#   No .env file exists in the container — Railway injects all service
#   variables directly into the process environment. This block is skipped.
#
# Precedence (highest → lowest):
#   1. docker run -e / Railway service variables
#   2. /app/.env (local dev mount)
#   3. ENV defaults baked into the image (Dockerfile)

set -e

if [ -f /app/.env ]; then
  echo "[Roland Web] Loading /app/.env (local development)"
  set -a
  # shellcheck source=/dev/null
  . /app/.env
  set +a
fi

exec "$@"
