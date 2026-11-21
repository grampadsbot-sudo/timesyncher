#!/usr/bin/env bash
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SHIP_REPO="${TSV_SHIP_REPO:-$HOME/tsv-dispatch/ship-repo}"
if [ -f "$SHIP_REPO/scripts/customer_suite/run.mjs" ]; then
  REPO_DIR="$SHIP_REPO"
fi
ROOT="${VK_SUITE_ROOT:-$HOME/tsv-dispatch/customer-suite}"
mkdir -p "$ROOT/logs" "$ROOT/results"
export PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:/usr/bin:/bin"
cd "$REPO_DIR" || exit 2
echo "[$(date -u +%FT%TZ)] vk-customer-suite ${1:-?} start (repo $REPO_DIR @ $(git rev-parse --short HEAD 2>/dev/null || echo unknown))"
case "${1:-}" in
  scheduled)    flock -w 2400 "$ROOT/.suite.lock" node scripts/customer_suite/run.mjs --trigger cron ;;
  deploy-watch) flock -n "$ROOT/.suite.lock" node scripts/customer_suite/deploy-watch.mjs ;;
  *) echo "usage: cron.sh scheduled|deploy-watch" >&2; exit 2 ;;
esac
rc=$?
echo "[$(date -u +%FT%TZ)] vk-customer-suite ${1:-?} done rc=$rc"
exit $rc
