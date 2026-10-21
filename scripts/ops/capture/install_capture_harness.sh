#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: install_capture_harness.sh --require-sha <full-producer-sha> [--repo-root <path>] [--dest <capture-dir>]" >&2
  exit 2
}

REQUIRE_SHA=""
REPO_ROOT=""
DEST="${TSV_CAPTURE_INSTALL_DIR:-${HOME}/tsv-dispatch/capture}"
INSTALLED_CAPTURE_SHA=e08148c0527e0ab70310d0c79cd1007eed306803359cb4d44cd0ff8c710184af

while [ -n "${1:-}" ]; do
  case "$1" in
    --require-sha) REQUIRE_SHA="${2:-}"; shift 2 ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --dest) DEST="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

[ -n "$REQUIRE_SHA" ] || usage
[[ "$REQUIRE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "install_capture_harness: --require-sha must be full 40-char hex, got: $REQUIRE_SHA" >&2
  exit 2
}

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
PATCH="$REPO_ROOT/scripts/ops/capture/capture-replay-init.patch"
REPLAY_SRC="$REPO_ROOT/scripts/ops/capture/timeline-replay.mjs"

if ! git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "install_capture_harness: not a git worktree: $REPO_ROOT" >&2
  exit 2
fi

HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [ "$HEAD" != "$REQUIRE_SHA" ]; then
  echo "install_capture_harness: repo HEAD $HEAD must equal --require-sha $REQUIRE_SHA (exact)" >&2
  exit 2
fi

[ -f "$PATCH" ] || { echo "install_capture_harness: missing $PATCH" >&2; exit 2; }
[ -f "$REPLAY_SRC" ] || { echo "install_capture_harness: missing $REPLAY_SRC" >&2; exit 2; }
[ -f "$DEST/capture.mjs" ] || { echo "install_capture_harness: missing $DEST/capture.mjs" >&2; exit 2; }

CUR="$(sha256sum "$DEST/capture.mjs" | awk '{print $1}')"
if [ "$CUR" != "$INSTALLED_CAPTURE_SHA" ]; then
  echo "install_capture_harness: $DEST/capture.mjs sha256 $CUR != expected installed $INSTALLED_CAPTURE_SHA; refuse wholesale overwrite" >&2
  exit 2
fi

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP="$DEST/backups/replay-init-$REQUIRE_SHA-$STAMP"
mkdir -p "$BACKUP"
cp -a "$DEST/capture.mjs" "$BACKUP/"
if [ -f "$DEST/timeline-replay.mjs" ]; then cp -a "$DEST/timeline-replay.mjs" "$BACKUP/"; fi

(
  cd "$DEST"
  patch -p0 --forward < "$PATCH"
)
NEW_SHA="$(sha256sum "$DEST/capture.mjs" | awk '{print $1}')"
install -m 664 "$REPLAY_SRC" "$DEST/timeline-replay.mjs"

echo "install_capture_harness OK producer=$REQUIRE_SHA dest=$DEST capture_sha=$NEW_SHA backup=$BACKUP"
