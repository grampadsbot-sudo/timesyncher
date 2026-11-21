#!/usr/bin/env bash
set -euo pipefail
ROOT="$HOME/tsv-dispatch/customer-suite"
export PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "${BASH_SOURCE[0]}")"
mkdir -p "$ROOT/logs"
case "${1:-}" in
  scheduled) exec flock -w 120 "$ROOT/.lock" node preflight.mjs cron ;;
  deploy-watch) exec flock -n "$ROOT/.lock" node deploy-watch.mjs ;;
  post-deploy) exec flock -w 120 "$ROOT/.lock" node deploy-watch.mjs --post-deploy ;;
  *) exit 2 ;;
esac
