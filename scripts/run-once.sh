#!/usr/bin/env bash
set -euo pipefail
cd /home/timesyncher-agent/timestopper-vacation-worker
set -a
. ./.env
set +a
node ./timestopper-worker.mjs --once
