#!/bin/bash
set -euo pipefail
ROOT="${TSV_DISPATCH_ROOT:-$HOME/tsv-dispatch}"
mkdir -p "$ROOT/state" "$ROOT/acceptance" "$ROOT/logs" "$ROOT/harness-runs"
exec 9>>"$ROOT/state/vk-ship-round.lock"
if ! flock -n 9; then
  exit 0
fi
TOKEN_FILE="${GH_TOKEN_FILE:-/home/ubishere9995/.config/tsv-gateb/gh-token}"
if [ -z "${GH_TOKEN:-}" ] && [ -f "$TOKEN_FILE" ]; then
  GH_TOKEN="$(cat "$TOKEN_FILE")"
  export GH_TOKEN
fi
export TSV_DISPATCH_ROOT="$ROOT"
REPO_DIR="${TSV_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$REPO_DIR"
exec node "$REPO_DIR/scripts/host/vk_ship_round.mjs" "$@"
