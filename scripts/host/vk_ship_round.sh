#!/bin/bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT="${TSV_DISPATCH_ROOT:-$HOME/tsv-dispatch}"
SHIP="${TSV_SHIP_REPO:-$ROOT/ship-repo}"
if [ "${1:-}" = "--dry" ]; then
  if [ -f "$HERE/vk_ship_round.mjs" ]; then
    exec node "$HERE/vk_ship_round.mjs" --dry
  fi
  exec node "$ROOT/bootstrap/vk_ship_round.mjs" --dry
fi
if [ "${TSV_SHIP_LOCKED:-}" != "1" ]; then
  mkdir -p "$ROOT/state" "$ROOT/acceptance" "$ROOT/logs" "$ROOT/harness-runs"
  exec 9>>"$ROOT/state/vk-ship-round.lock"
  if ! flock -n 9; then
    exit 0
  fi
  export TSV_SHIP_LOCKED=1
fi
TOKEN_FILE="${GH_TOKEN_FILE:-/home/ubishere9995/.config/tsv-gateb/gh-token}"
if [ -z "${GH_TOKEN:-}" ] && [ -f "$TOKEN_FILE" ]; then
  GH_TOKEN="$(cat "$TOKEN_FILE")"
  export GH_TOKEN
fi
export TSV_DISPATCH_ROOT="$ROOT"
export TSV_REPO="$SHIP"
if [ "${TSV_SHIP_FETCHED:-}" != "1" ]; then
  if [ ! -d "$SHIP/.git" ]; then
    gh repo clone grampadsbot-sudo/timesyncher "$SHIP"
  fi
  git -C "$SHIP" remote set-url origin https://github.com/grampadsbot-sudo/timesyncher.git
  url="$(git -C "$SHIP" remote get-url origin)"
  case "$url" in
    *@*)
      printf '%s\n' 'refusing remote url with credentials' >&2
      exit 1
      ;;
  esac
  git -C "$SHIP" config --local --unset-all http.https://github.com/.extraheader || true
  git -C "$SHIP" -c 'credential.helper=!gh auth git-credential' fetch origin vk
  git -C "$SHIP" checkout -B vk origin/vk
  git -C "$SHIP" reset --hard origin/vk
  export TSV_SHIP_FETCHED=1
  fresh="$SHIP/scripts/host/vk_ship_round.sh"
  if [ -f "$fresh" ] && [ "$fresh" != "$HERE/vk_ship_round.sh" ]; then
    exec "$fresh" "$@"
  fi
  if [ ! -f "$fresh" ]; then
    export TSV_SHIP_BOOTSTRAP=1
    exec node "$ROOT/bootstrap/vk_ship_round.mjs" "$@"
  fi
fi
exec node "$HERE/vk_ship_round.mjs" "$@"
