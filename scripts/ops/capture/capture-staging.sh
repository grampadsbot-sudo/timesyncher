#!/usr/bin/env bash
set -euo pipefail
OUT=${1:?usage: capture-staging.sh <outdir> <replay-producer-sha> <render-head>}
PRODUCER_SHA=${2:?usage: capture-staging.sh <outdir> <replay-producer-sha> <render-head>}
RENDER_HEAD=${3:?usage: capture-staging.sh <outdir> <replay-producer-sha> <render-head>}
C=${TSV_CAPTURE_INSTALL_DIR:-/home/ubishere9995/tsv-dispatch/capture}
BASE=${TSV_CAPTURE_BASE:-https://vacation-staging.timesyncher.com}
[[ "$PRODUCER_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "capture-staging: replay producer sha must be 40-char hex, got: $PRODUCER_SHA" >&2
  exit 2
}
[[ "$RENDER_HEAD" =~ ^[0-9a-f]{40}$ ]] || {
  echo "capture-staging: render head must be 40-char hex, got: $RENDER_HEAD" >&2
  exit 2
}
if [ -z "${TSV_CAPTURE_REPO_ROOT:-}" ] || [ -z "${TSV_CAPTURE_PRODUCER_HEAD_SHA:-}" ]; then
  echo "capture-staging: missing TSV_CAPTURE_REPO_ROOT / TSV_CAPTURE_PRODUCER_HEAD_SHA (caller must bind producer)" >&2
  exit 2
fi
if [ "$TSV_CAPTURE_PRODUCER_HEAD_SHA" != "$PRODUCER_SHA" ]; then
  echo "capture-staging: env producer $TSV_CAPTURE_PRODUCER_HEAD_SHA != argv $PRODUCER_SHA" >&2
  exit 2
fi
if [ -z "${TSV_CAPTURE_RENDER_HEAD_SHA:-}" ]; then
  echo "capture-staging: missing TSV_CAPTURE_RENDER_HEAD_SHA (caller must bind renderer)" >&2
  exit 2
fi
if [ "$TSV_CAPTURE_RENDER_HEAD_SHA" != "$RENDER_HEAD" ]; then
  echo "capture-staging: env render $TSV_CAPTURE_RENDER_HEAD_SHA != argv $RENDER_HEAD" >&2
  exit 2
fi
if [ -z "${TSV_CAPTURE_FIXTURE_SHA256:-}" ]; then
  echo "capture-staging: missing TSV_CAPTURE_FIXTURE_SHA256 (caller must pin fixture digest)" >&2
  exit 2
fi
if [ -z "${TSV_CAPTURE_FIXTURE:-}" ] || [ ! -f "$TSV_CAPTURE_FIXTURE" ]; then
  echo "capture-staging: missing TSV_CAPTURE_FIXTURE file (caller must pass fixture path)" >&2
  exit 2
fi
actual=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$TSV_CAPTURE_FIXTURE")
if [ "$actual" != "$TSV_CAPTURE_FIXTURE_SHA256" ]; then
  echo "capture-staging: fixture digest mismatch" >&2
  exit 2
fi
live=$(curl -s -m 15 "$BASE/api/version" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("commit") or d.get("sha") or d.get("version") or "").strip())' 2>/dev/null || true)
if ! python3 - "$live" "$RENDER_HEAD" <<'CHECK_SHA'
import re, sys
live, expected = sys.argv[1:]
ok = live == expected or (re.fullmatch(r'[0-9a-f]{7,39}', live) is not None and expected.startswith(live))
sys.exit(0 if ok else 2)
CHECK_SHA
then
  echo "capture-staging: served build does not match render_head" >&2
  exit 2
fi

mkdir -p "$OUT" "$C/fontcache"
export FONTCONFIG_FILE=$C/fonts.conf
export TSV_CAPTURE_BASE=$BASE
export TSV_CAPTURE_RENDER_HEAD_SHA=$RENDER_HEAD
node "$C/capture.mjs" "$OUT" "$PRODUCER_SHA"
EVIDENCE=$(dirname "$0")/budget_capture_evidence.py
if [ -f "$EVIDENCE" ] && [ -f "$OUT/capture-regions.json" ]; then
  python3 "$EVIDENCE" --regions "$OUT/capture-regions.json" --fixture "$TSV_CAPTURE_FIXTURE" --out "$OUT/budget-evidence.json" --comment "$OUT/budget-membership-comment.txt"
fi
