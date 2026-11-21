#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIP_DIR="${TSV_SHIP_REPO:-$HOME/tsv-dispatch/ship-repo}/scripts/customer_suite"
if [ -f "$SHIP_DIR/cron.sh" ]; then
  DIR="$SHIP_DIR"
fi
LOG="${VK_SUITE_ROOT:-$HOME/tsv-dispatch/customer-suite}/logs"
mkdir -p "$LOG"
chmod +x "$DIR/cron.sh"
SCHED="0 */2 * * * $DIR/cron.sh scheduled >> $LOG/cron.log 2>&1 # vk-customer-suite every 2h (timesyncher#1075)"
HOOK="*/5 * * * * $DIR/cron.sh deploy-watch >> $LOG/deploy-watch.log 2>&1 # vk-customer-suite post-deploy hook (timesyncher#1075)"
{ crontab -l 2>/dev/null | grep -v '# vk-customer-suite' || true; echo "$SCHED"; echo "$HOOK"; } | crontab -
crontab -l | grep '# vk-customer-suite'
