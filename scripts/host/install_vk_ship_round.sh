#!/bin/bash
set -euo pipefail
ROOT="${TSV_DISPATCH_ROOT:-$HOME/tsv-dispatch}"
REF="${1:-${TSV_SHIP_INSTALL_REF:-}}"
preflight() {
  missing=""
  if [ -z "$REF" ]; then missing="${missing} install-ref"; fi
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
if ! preflight; then
  exit 1
fi
install -d -m 775 "$ROOT/acceptance" "$ROOT/state" "$ROOT/logs" "$ROOT/harness-runs" "$ROOT/bin" "$ROOT/bootstrap"
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
  python3 -c 'import os,sys
root=os.environ.get("TSV_DISPATCH_ROOT") or os.path.expanduser("~/tsv-dispatch")
sys.path.insert(0, root)
from tsv_common import GH
path, ref = sys.argv[1], sys.argv[2]
sys.stdout.buffer.write(GH().req("GET", "/repos/grampadsbot-sudo/timesyncher/contents/"+path+"?ref="+ref, raw=True, accept="application/vnd.github.raw+json"))
' "$1" "$REF"
}
fetch_raw scripts/host/vk_ship_round.sh > "$ROOT/bin/vk_ship_round.sh"
fetch_raw scripts/host/vk_ship_round.mjs > "$ROOT/bootstrap/vk_ship_round.mjs"
fetch_raw scripts/host/vk_ship_round_core.mjs > "$ROOT/bootstrap/vk_ship_round_core.mjs"
fetch_raw scripts/host/vk_ship_github.py > "$ROOT/bootstrap/vk_ship_github.py"
chmod 755 "$ROOT/bin/vk_ship_round.sh"
export TSV_DISPATCH_ROOT="$ROOT"
export TSV_SHIP_TRACK_ISSUE="${TSV_SHIP_TRACK_ISSUE:-1041}"
exec "$ROOT/bin/vk_ship_round.sh"
