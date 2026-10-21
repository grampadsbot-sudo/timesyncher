#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: apply_capture_replay_runtime_patch.sh --runtime <path> [--patch <path>] [--manifest <path>] [--out <path>]" >&2
  exit 2
}

RUNTIME=""
PATCH=""
MANIFEST=""
OUT=""
SUPPORT="$(cd "$(dirname "$0")" && pwd)"
PATCH="${SUPPORT}/capture-replay-runtime.patch"
MANIFEST="${SUPPORT}/capture-replay-runtime-manifest.json"

while [ -n "${1:-}" ]; do
  case "$1" in
    --runtime) RUNTIME="${2:-}"; shift 2 ;;
    --patch) PATCH="${2:-}"; shift 2 ;;
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

[ -n "$RUNTIME" ] || usage
[ -f "$RUNTIME" ] || { echo "missing runtime: $RUNTIME" >&2; exit 2; }
[ -f "$PATCH" ] || { echo "missing patch: $PATCH" >&2; exit 2; }
[ -f "$MANIFEST" ] || { echo "missing manifest: $MANIFEST" >&2; exit 2; }

EXPECTED="$(python3 -c "import json; print(json.load(open('$MANIFEST'))['runtime_dispatcher_sha256'])")"
ACTUAL="$(sha256sum "$RUNTIME" | awk '{print $1}')"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "runtime sha256 $ACTUAL != manifest runtime_dispatcher_sha256 $EXPECTED; refuse" >&2
  exit 2
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
RUNTIME_NAME="$(python3 -c "import json; print(json.load(open('$MANIFEST'))['runtime_path'])")"
cp -a "$RUNTIME" "$WORKDIR/$RUNTIME_NAME"
(
  cd "$WORKDIR"
  patch -p0 --fuzz=0 "$RUNTIME_NAME" -i "$PATCH"
)
python3 -m py_compile "$WORKDIR/$RUNTIME_NAME"

if [ -n "$OUT" ]; then
  install -m 664 "$WORKDIR/$RUNTIME_NAME" "$OUT"
  echo "apply_capture_replay_runtime_patch OK out=$OUT"
else
  echo "apply_capture_replay_runtime_patch OK verified (dry; pass --out to write candidate)"
fi
