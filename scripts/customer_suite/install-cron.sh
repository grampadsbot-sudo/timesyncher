#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$HOME/tsv-dispatch/customer-suite/logs"
mkdir -p "$LOG"
SCHEDULE="0 */2 * * * bash \"$DIR/cron.sh\" scheduled >> \"$LOG/cron.log\" 2>&1 # vk-customer-suite-1075"
HOOK="*/5 * * * * bash \"$DIR/cron.sh\" deploy-watch >> \"$LOG/deploy-watch.log\" 2>&1 # vk-customer-suite-1075"
current="$(crontab -l 2>&1)" || {
  [[ "$current" == *"no crontab for"* ]] || { printf '%s\n' "$current" >&2; exit 1; }
  current=""
}
{
  printf '%s\n' "$current" | grep -v '# vk-customer-suite-1075' || true
  printf '%s\n' "$SCHEDULE" "$HOOK"
} | crontab -
