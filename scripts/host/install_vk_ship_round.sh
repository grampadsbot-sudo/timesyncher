#!/bin/bash
set -euo pipefail
ROOT="${TSV_DISPATCH_ROOT:-$HOME/tsv-dispatch}"
REF="${TSV_SHIP_INSTALL_REF:-refs/pull/1042/head}"
install -d -m 775 "$ROOT/acceptance" "$ROOT/state" "$ROOT/logs" "$ROOT/harness-runs" "$ROOT/bin" "$ROOT/bootstrap"
TOKEN_FILE="${GH_TOKEN_FILE:-/home/ubishere9995/.config/tsv-gateb/gh-token}"
if [ -z "${GH_TOKEN:-}" ] && [ -f "$TOKEN_FILE" ]; then
  GH_TOKEN="$(cat "$TOKEN_FILE")"
  export GH_TOKEN
fi
current="$(crontab -l 2>/dev/null || true)"
printf '%s\n' "$current" > "$ROOT/state/crontab.bak"
line="*/10 * * * * TSV_SHIP_TRACK_ISSUE=1041 ${ROOT}/bin/vk_ship_round.sh >> ${ROOT}/logs/vk-ship-round.log 2>&1"
if ! printf '%s\n' "$current" | grep -F "${ROOT}/bin/vk_ship_round.sh" >/dev/null; then
  if [ -n "$current" ]; then
    printf '%s\n%s\n' "$current" "$line" | crontab -
  else
    printf '%s\n' "$line" | crontab -
  fi
fi
fetch_raw() {
  gh api -H "Accept: application/vnd.github.raw+json" "/repos/grampadsbot-sudo/timesyncher/contents/${1}?ref=${REF}"
}
fetch_raw scripts/host/vk_ship_round.sh > "$ROOT/bin/vk_ship_round.sh"
fetch_raw scripts/host/vk_ship_round.mjs > "$ROOT/bootstrap/vk_ship_round.mjs"
fetch_raw scripts/host/vk_ship_round_core.mjs > "$ROOT/bootstrap/vk_ship_round_core.mjs"
chmod 755 "$ROOT/bin/vk_ship_round.sh"
export TSV_DISPATCH_ROOT="$ROOT"
export TSV_SHIP_TRACK_ISSUE="${TSV_SHIP_TRACK_ISSUE:-1041}"
exec "$ROOT/bin/vk_ship_round.sh"
