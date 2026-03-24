#!/usr/bin/env bash
# roland-docker.sh — Run Roland + Goose in a Docker container with restricted permissions.
#
# Usage:
#   ./scripts/roland-docker.sh [project-dir] [goose-args...]
#
# Examples:
#   ./scripts/roland-docker.sh /path/to/project session
#   ./scripts/roland-docker.sh /path/to/project run --no-session -t "Fix the auth bug"
#   ./scripts/roland-docker.sh .  # current dir, interactive session
#
# Environment:
#   OPENROUTER_API_KEY  — required
#   GOOSE_PROVIDER      — optional (default: openrouter)
#   GOOSE_MODEL         — optional (default: anthropic/claude-haiku-4.5)
#   ROLAND_IMAGE        — optional (default: roland-goose:latest)

set -euo pipefail

PROJECT_DIR="${1:-.}"
shift || true
GOOSE_ARGS="${@:-session}"

# Resolve absolute path
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

# Validate
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "Error: OPENROUTER_API_KEY is not set." >&2
  echo "  export OPENROUTER_API_KEY=sk-or-..." >&2
  exit 1
fi

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Project directory does not exist: $PROJECT_DIR" >&2
  exit 1
fi

IMAGE="${ROLAND_IMAGE:-roland-goose:latest}"

# Check if image exists, build if not
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building Roland Docker image..."
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  ROLAND_ROOT="$(dirname "$SCRIPT_DIR")"
  docker build -t "$IMAGE" "$ROLAND_ROOT"
fi

echo "Starting Roland + Goose container..."
echo "  Project: $PROJECT_DIR"
echo "  Image:   $IMAGE"
echo "  Args:    $GOOSE_ARGS"
echo ""

# Run container with:
# - Project dir mounted read-write at /workspace
# - .goose config mounted read-only (if exists)
# - .roland-permissions.json mounted read-only (if exists)
# - roland-context.json mounted read-write (if exists)
# - No access to host filesystem outside project dir
# - No network access to local services (bridge network)
# - Non-root user
MOUNT_ARGS="-v ${PROJECT_DIR}:/workspace"

# Mount goose config if present
if [ -f "$PROJECT_DIR/.goose/config.yaml" ]; then
  MOUNT_ARGS="$MOUNT_ARGS -v ${PROJECT_DIR}/.goose/config.yaml:/root/.config/goose/config.yaml:ro"
fi

# Pass through env vars
ENV_ARGS="-e OPENROUTER_API_KEY"
[ -n "${GOOSE_PROVIDER:-}" ] && ENV_ARGS="$ENV_ARGS -e GOOSE_PROVIDER"
[ -n "${GOOSE_MODEL:-}" ] && ENV_ARGS="$ENV_ARGS -e GOOSE_MODEL"

docker run --rm -it \
  $MOUNT_ARGS \
  $ENV_ARGS \
  -e ROLAND_PROJECT_ROOT=/workspace \
  -e GOOSE_MODE=auto \
  --workdir /workspace \
  "$IMAGE" \
  $GOOSE_ARGS
