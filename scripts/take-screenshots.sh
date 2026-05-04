#!/usr/bin/env bash
# Spin up decree backend, seed fixtures, capture UI screenshots, tear down dev server.
#
# Usage:
#   ./scripts/take-screenshots.sh              # fast: reuse existing stack
#   ./scripts/take-screenshots.sh --rebuild    # rebuild decree-server image first
#
# Env:
#   DECREE_REPO   path to decree repo (default: ../decree)
#   BASE_URL      UI dev server URL  (default: http://localhost:5174)
#   API_URL       decree REST URL    (default: http://localhost:8080)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DECREE_REPO="${DECREE_REPO:-$REPO_ROOT/../decree}"
BASE_URL="${BASE_URL:-http://localhost:5174}"
API_URL="${API_URL:-http://localhost:8080}"
COMPOSE_SERVICES="postgres redis migrate service"
DEV_PID=""

cleanup() {
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true
}
trap cleanup EXIT

# --- flags ---
REBUILD=false
for arg in "$@"; do
  case $arg in
    --rebuild) REBUILD=true ;;
  esac
done

# --- optionally rebuild image ---
if [ "$REBUILD" = true ]; then
  echo "Building decree-server image..."
  (cd "$DECREE_REPO" && make image)
fi

# --- bring up compose (idempotent) ---
echo "Starting compose services..."
(cd "$DECREE_REPO" && SERVICE_IMAGE=decree-server docker compose up -d $COMPOSE_SERVICES --wait)

# --- build decree CLI ---
echo "Building decree CLI..."
(cd "$DECREE_REPO" && make build 2>&1 | grep -v "^go: \|^#" || true)
DECREE_BIN="$DECREE_REPO/bin/decree"

# --- seed fixtures (idempotent) ---
echo "Seeding fixtures..."
"$DECREE_BIN" seed "$DECREE_REPO/fixtures/billing.yaml"  --server localhost:9090 --subject admin --auto-publish
"$DECREE_BIN" seed "$DECREE_REPO/fixtures/showcase.yaml" --server localhost:9090 --subject admin --auto-publish

# --- start UI dev server ---
# Kill any stale vite process on the target port.
pkill -f "vite.*--port 5174" 2>/dev/null || true

echo "Starting UI dev server on port 5174..."
(cd "$REPO_ROOT" && VITE_HIDE_DEBUG=1 npm run dev -- --port 5174 > /tmp/decree-ui-screenshots-dev.log 2>&1) &
DEV_PID=$!

# Wait up to 15 s for the server to be ready.
for i in $(seq 1 15); do
  if curl -sf "$BASE_URL" > /dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "$BASE_URL" > /dev/null || { echo "UI dev server did not start"; exit 1; }

# --- run screenshots ---
echo "Capturing screenshots..."
(cd "$REPO_ROOT" && BASE_URL="$BASE_URL" API_URL="$API_URL" npm run screenshots)

echo ""
echo "Screenshots saved to $REPO_ROOT/docs/screenshots/"
