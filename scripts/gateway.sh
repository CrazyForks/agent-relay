#!/usr/bin/env bash
set -euo pipefail

BUN="${AGENT_RELAY_BUN_PATH:-bun}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND="${1:-}"

usage() {
  echo "usage: $(basename "$0") <setup|start|stop|status|remove>"
}

case "$COMMAND" in
  setup | start | stop | status | remove)
    ;;
  help | -h | --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac

if ! command -v "$BUN" >/dev/null 2>&1; then
  echo "Bun is not available; set AGENT_RELAY_BUN_PATH or add bun to PATH" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec "$BUN" src/gateway/manage.ts "$COMMAND"
