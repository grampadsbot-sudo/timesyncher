#!/bin/bash
set -euo pipefail
SHIP_ROUND_VERSION=2
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT="${TSV_DISPATCH_ROOT:-$HOME/tsv-dispatch}"
SHIP="${TSV_SHIP_REPO:-$ROOT/ship-repo}"
version_of() {
  local file="$1" line
  line=$(grep -E '^SHIP_ROUND_VERSION=[0-9]+$' "$file" 2>/dev/null | head -1 || true)
  line="${line#SHIP_ROUND_VERSION=}"
  if [ -z "$line" ]; then
    printf '%s\n' 0
    return 0
  fi
  printf '%s\n' "$line"
}
vk_copy_current() {
  [ "$2" -ge "$1" ]
}
preflight() {
  missing=""
  if ! python3 -c 'import os,sys
root=os.environ.get("TSV_DISPATCH_ROOT") or os.path.expanduser("~/tsv-dispatch")
sys.path.insert(0, root)
try:
    from tsv_common import GH
    gh=GH()
except Exception:
    sys.exit(2)
sys.exit(0 if gh.tok else 2)' >/dev/null 2>&1; then
    missing="${missing} GitHub auth"
  fi
  if ! command -v git >/dev/null 2>&1; then missing="${missing} git"; fi
  if ! command -v node >/dev/null 2>&1; then missing="${missing} node"; fi
  dispatch="${TSV_DISPATCH_BIN:-$ROOT/tsv_dispatch.py}"
  if [ ! -f "$dispatch" ]; then missing="${missing} batch_deploy"; fi
  if [ -n "$missing" ]; then
    printf 'preflight: missing%s\n' "$missing" >&2
    return 1
  fi
  return 0
}
if [ "${SHIP_ROUND_LIB:-}" = 1 ]; then
  return 0 2>/dev/null || exit 0
fi
helper_path() {
  if [ -f "$HERE/vk_ship_github.py" ]; then
    printf '%s\n' "$HERE/vk_ship_github.py"
    return 0
  fi
  printf '%s\n' "$ROOT/bootstrap/vk_ship_github.py"
}
if [ "${1:-}" = "--dry" ]; then
  if [ -f "$HERE/vk_ship_round.mjs" ]; then
    exec node "$HERE/vk_ship_round.mjs" --dry
  fi
  exec node "$ROOT/bootstrap/vk_ship_round.mjs" --dry
fi
if ! preflight; then
  exit 1
fi
if [ "${1:-}" = "--preflight" ]; then
  exit 0
fi
if [ "${TSV_SHIP_LOCKED:-}" != "1" ]; then
  mkdir -p "$ROOT/state" "$ROOT/acceptance" "$ROOT/logs" "$ROOT/harness-runs"
  exec 9>>"$ROOT/state/vk-ship-round.lock"
  if ! flock -n 9; then
    exit 0
  fi
  export TSV_SHIP_LOCKED=1
fi
export TSV_DISPATCH_ROOT="$ROOT"
export TSV_REPO="$SHIP"
HELPER="$(helper_path)"
if [ "${TSV_SHIP_FETCHED:-}" != "1" ]; then
  if [ ! -d "$SHIP/.git" ]; then
    git -c "credential.helper=!python3 ${HELPER} credential" clone https://github.com/grampadsbot-sudo/timesyncher.git "$SHIP"
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
  git -C "$SHIP" -c "credential.helper=!python3 ${HELPER} credential" fetch origin vk
  git -C "$SHIP" checkout -B vk origin/vk
  git -C "$SHIP" reset --hard origin/vk
  export TSV_SHIP_FETCHED=1
  fresh="$SHIP/scripts/host/vk_ship_round.sh"
  installed_version="$(version_of "$HERE/vk_ship_round.sh")"
  fresh_version="$(version_of "$fresh")"
  if [ -f "$fresh" ] && [ "$fresh" != "$HERE/vk_ship_round.sh" ] && vk_copy_current "$installed_version" "$fresh_version"; then
    exec "$fresh" "$@"
  fi
  if [ ! -f "$fresh" ] || ! vk_copy_current "$installed_version" "$fresh_version"; then
    export TSV_SHIP_BOOTSTRAP=1
    exec node "$ROOT/bootstrap/vk_ship_round.mjs" "$@"
  fi
fi
exec node "$HERE/vk_ship_round.mjs" "$@"
