#!/usr/bin/env bash
# grok-issue-run.sh <issue> <prompt-file>
# grok-issue-run.sh --pr <pr> <prompt-file>
# Runs Grok Build headless on one TSV issue in ~/grok-runs/tsv-<issue>. Script-only acks (no model).
# --pr: same run on an existing PR head (open or draft) in a fresh detached worktree.
#       Fast-forward push to that PR's own head ref only. Draft stays draft.
#       No ready-for-review, no merge, no force-push, no push to main or the PR base.
#       App code under src/ may be pushed. .github/, CI config, secrets, lint ratchet
#       and baselines may not. hold:dr-diagnosis and CURSOR_STOP do not block --pr.
#       kickback and an explicit stop do.
# Source the guards with: GROK_ISSUE_RUN_LIB=1 source grok-issue-run.sh
set -u

# --- guards (unit-tested; no side effects) ---

# Draft and open PRs can run. Closed and merged cannot. Never flips draft->ready.
pr_runnable_state() {
  case "$1" in
    open|draft) return 0 ;;
    *) return 1 ;;
  esac
}

# 0 if this path must not be pushed. pr mode allows src/ app code. issue mode does not.
path_forbidden() {
  local mode="$1" p="$2" low
  low=$(printf '%s' "$p" | tr '[:upper:]' '[:lower:]')
  case "$p" in
    .github/*|.vercel/*|vercel.json|routes/*|baselines/*) return 0 ;;
  esac
  case "$low" in
    *ratchet*|*baseline*) return 0 ;;
    *secret*|*credential*) return 0 ;;
    .env|.env.*|*/.env|*/.env.*) return 0 ;;
    *.pem|*.key) return 0 ;;
    eslint.config.*|*/eslint.config.*|*/.eslintrc*|*.eslintrc*) return 0 ;;
  esac
  if [ "$mode" != pr ]; then
    case "$p" in
      src/*) return 0 ;;
    esac
  fi
  return 1
}

# Prints the forbidden subset of a newline-separated path list.
paths_forbidden() {
  local mode="$1" p bad=""
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    if path_forbidden "$mode" "$p"; then bad="${bad}${p}"$'\n'; fi
  done
  printf '%s' "$bad"
}

# Echo a block reason, or nothing. CURSOR_STOP is not an input and does not block.
# stop_file is the explicit stop switch (default caller passes ~/tsv-dispatch/GROK_STOP).
hold_block_reason() {
  local labels="$1" stop_file="${2:-}" line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      kickback) printf '%s\n' "kickback"; return 0 ;;
      stop|status:stop) printf '%s\n' "explicit stop"; return 0 ;;
      hold:dr-diagnosis) ;;
      hold:*) printf '%s\n' "hold $line"; return 0 ;;
    esac
  done <<<"$labels"
  if [ -n "$stop_file" ] && [ -f "$stop_file" ]; then
    printf '%s\n' "explicit stop"
    return 0
  fi
  return 0
}

# 0 when this push must be refused (main, the base branch, empty, or any force flag).
push_refused() {
  local br="$1" base="$2" flags="${3:-}"
  case "$flags" in
    *force*|*\ -f\ *|\ -f|*-f)
      return 0 ;;
  esac
  case "$br" in
    ""|main|master|+*) return 0 ;;
  esac
  [ "$br" = "$base" ] && return 0
  return 1
}

turn_cap_default() { printf '%s\n' 40; }

cap_commit_subject() {
  printf '#%s: Grok Build hit the %s-turn cap; partial work auto-committed by wrapper\n' "$1" "$2"
}

if [ "${GROK_ISSUE_RUN_LIB:-}" = 1 ]; then
  return 0 2>/dev/null || exit 0
fi

# --- run ---

MODE=issue
if [ "${1:-}" = "--pr" ]; then MODE=pr; N="${2:-}"; PROMPT_IN="${3:-}"; else N="${1:-}"; PROMPT_IN="${2:-}"; fi
BASE=cursor/jev-quality-r20-1128
RBASE="origin/$BASE"
DIR="$HOME/grok-runs/tsv-$N"
GROK="$HOME/.local/bin/grok"
GHAPI="$HOME/bin/gh-issue-api.py"
TS=$(date -u +%Y%m%dT%H%M%SZ)
LOGDIR="$HOME/grok-runs/logs/$N-$TS"
mkdir -p "$LOGDIR"
exec >>"$LOGDIR/wrapper.log" 2>&1
pt() { TZ=America/Los_Angeles date +"%-I:%M %p PT"; }
say() { echo "[$(date -u +%FT%TZ)] $*"; }
comment() { python3 "$GHAPI" comment "$N" "$1" || say "comment post failed"; }

MODEL="${GROK_MODEL:-grok-4.7}"
MAXTURNS="${GROK_MAX_TURNS:-40}"
HARD_LOG="$HOME/tsv-dispatch/logs/hard-round-comparison.jsonl"
RUN_START=$(date +%s)
GROK_WALL=0
HARD_TURNS=0
HARD_TOKENS=0
HARD_CI="not-pushed"
HARD_GATEB="not-run"
HARD_PUSHED=0
HARD_CAPHIT=0
HARD_START=""
HARD_END=""
HARD_LOGGED=0
PRBASE=""
HEADSHA=""
PARTIAL=0

log_hard_round() {
  [ "$HARD_LOGGED" = 1 ] && return 0
  HARD_LOGGED=1
  HARD_END=$(git rev-parse HEAD 2>/dev/null || true)
  local wall=$(( $(date +%s) - RUN_START ))
  HARD_MODEL="$MODEL" HARD_TURNS="$HARD_TURNS" HARD_CAP="$MAXTURNS" HARD_COST="unknown" \
  HARD_TOKENS="$HARD_TOKENS" HARD_WALL="$GROK_WALL" HARD_START="$HARD_START" HARD_END="$HARD_END" \
  HARD_CI="$HARD_CI" HARD_GATEB="$HARD_GATEB" HARD_MODE="$MODE" HARD_N="$N" \
  HARD_CAPHIT="$HARD_CAPHIT" HARD_PUSHED="$HARD_PUSHED" HARD_LOG="$HARD_LOG" \
  HARD_LOGDIR="$LOGDIR" python3 - <<'PY'
import json, os, time
rec = {
    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "lane": "grok-build",
    "model": os.environ.get("HARD_MODEL", ""),
    "turns": int(os.environ.get("HARD_TURNS") or 0),
    "turn_cap": int(os.environ.get("HARD_CAP") or 0),
    "cost": os.environ.get("HARD_COST") or "unknown",
    "tokens": int(os.environ.get("HARD_TOKENS") or 0),
    "wall_s": int(os.environ.get("HARD_WALL") or 0),
    "start_commit": os.environ.get("HARD_START", ""),
    "end_commit": os.environ.get("HARD_END", ""),
    "ci": os.environ.get("HARD_CI", "not-pushed"),
    "gateb": os.environ.get("HARD_GATEB", "not-run"),
    "mode": os.environ.get("HARD_MODE", ""),
    "n": os.environ.get("HARD_N", ""),
    "cap_hit": os.environ.get("HARD_CAPHIT", "") == "1",
    "pushed": os.environ.get("HARD_PUSHED", "") == "1",
}
path = os.environ["HARD_LOG"]
os.makedirs(os.path.dirname(path), exist_ok=True)
line = json.dumps(rec, separators=(",", ":"))
with open(path, "a", encoding="utf-8") as f:
    f.write(line + "\n")
logdir = os.environ.get("HARD_LOGDIR") or ""
if logdir:
    with open(os.path.join(logdir, "hard-round.json"), "w", encoding="utf-8") as f:
        f.write(line + "\n")
PY
}
trap log_hard_round EXIT
case "$MODEL" in
  *openrouter*|*deepseek*) say "refusing model $MODEL"; exit 1 ;;
esac
case "$MAXTURNS" in
  ''|*[!0-9]*) say "GROK_MAX_TURNS must be an integer"; exit 1 ;;
esac

note_usage() {
  local out="$1" parsed
  [ -f "$out" ] || return 0
  parsed=$(python3 -c '
import json,sys
turns=toks=0
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    line=line.strip()
    if not line: continue
    try: o=json.loads(line)
    except Exception: continue
    if o.get("type")=="end":
        turns=int(o.get("num_turns") or turns)
        u=o.get("usage") or {}
        toks=int(u.get("total_tokens") or toks)
print("%s %s" % (turns, toks))
' "$out" 2>/dev/null || true)
  local t="${parsed%% *}" k="${parsed##* }"
  case "$t" in ''|*[!0-9]*) t=0 ;; esac
  case "$k" in ''|*[!0-9]*) k=0 ;; esac
  HARD_TURNS=$((HARD_TURNS + t))
  HARD_TOKENS=$((HARD_TOKENS + k))
}

ensure_identity() {
  git config user.name >/dev/null 2>&1 || git config user.name "TimeSyncher Agent"
  git config user.email >/dev/null 2>&1 || git config user.email "timesyncher-agent@users.noreply.github.com"
}

poll_ci_and_gateb() {
  local sha="$1" wait_s="${GROK_CI_WAIT_S:-180}"
  HARD_CI=$(python3 -c '
import os, sys, time
sys.path.insert(0, "/home/ubishere9995/tsv-dispatch")
from tsv_common import GH, REPO
sha, wait_s, n = sys.argv[1], int(sys.argv[2]), sys.argv[3]
gh = GH()
repo = os.environ.get("GROK_GITHUB_REPO") or REPO
deadline = time.time() + wait_s
ci = "pending"
while True:
    try:
        data = gh.req("GET", "/repos/%s/commits/%s/check-runs?per_page=100" % (repo, sha))
    except Exception:
        data = {}
    runs = data.get("check_runs") or []
    if runs and all(r.get("status") == "completed" for r in runs):
        ok = all((r.get("conclusion") or "") in ("success", "skipped", "neutral") for r in runs)
        ci = "success" if ok else "failure"
        break
    if time.time() >= deadline:
        ci = "pending" if runs else "pending"
        break
    time.sleep(15)
gate = "not-run"
try:
    comments = gh.req("GET", "/repos/%s/issues/%s/comments?per_page=100" % (repo, int(n)))
except Exception:
    comments = []
short = sha[:7]
for c in comments or []:
    body = c.get("body") or ""
    if short in body and ("Gate B" in body or "gateb" in body.lower()):
        if "FAIL" in body: gate = "FAIL"
        elif "PASS" in body: gate = "PASS"
        else: gate = "mentioned"
print(ci)
print(gate)
' "$sha" "$wait_s" "$N" 2>>"$LOGDIR/ci-poll.err" || printf 'pending\nnot-run\n')
  HARD_GATEB=$(printf '%s\n' "$HARD_CI" | tail -1)
  HARD_CI=$(printf '%s\n' "$HARD_CI" | head -1)
}

if [ "$MODE" = pr ]; then
  PRREPO="${GROK_PR_REPO:-$HOME/projects/timesyncher}"
  PRJSON=$(python3 -I -c 'import os,sys,json; sys.path.insert(0,"/home/ubishere9995/tsv-dispatch"); from tsv_common import GH, REPO; repo=os.environ.get("GROK_GITHUB_REPO") or REPO; print(json.dumps(GH().req("GET", "/repos/%s/pulls/%d" % (repo, int(sys.argv[1])))))' "$N") || { say "PR lookup failed"; exit 1; }
  printf '%s' "$PRJSON" >"$LOGDIR/pr.json"
  BR=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["head"]["ref"])' "$LOGDIR/pr.json")
  HEADSHA=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["head"]["sha"])' "$LOGDIR/pr.json")
  PRSTATE=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("draft" if d.get("draft") else d.get("state") or "")' "$LOGDIR/pr.json")
  PRBASE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["base"]["ref"])' "$LOGDIR/pr.json")
  PRLABELS=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("\n".join((l.get("name") or "") for l in (d.get("labels") or [])))' "$LOGDIR/pr.json")
  if ! pr_runnable_state "$PRSTATE"; then say "PR #$N is $PRSTATE; not running"; exit 1; fi
  BLOCK=$(hold_block_reason "$PRLABELS" "$HOME/tsv-dispatch/GROK_STOP")
  if [ -n "$BLOCK" ]; then
    say "not running: $BLOCK"
    comment "failed: not running ($BLOCK). A dr-authorised --pr round still runs with hold:dr-diagnosis or CURSOR_STOP; kickback and an explicit stop block it (Grok Build on Ubuntu, $(pt)). log $LOGDIR"
    exit 1
  fi
  if push_refused "$BR" "$PRBASE" ""; then
    say "refusing PR head ref $BR (main/base)"
    comment "failed: PR head ref $BR is main or the base branch; nothing pushed (Grok Build on Ubuntu, $(pt)). log $LOGDIR"
    exit 1
  fi
  git -C "$PRREPO" fetch -q origin "$BR" || { comment "failed: fetch of $BR failed (Grok Build on Ubuntu, $(pt)). log $LOGDIR"; exit 1; }
  DIR="$HOME/grok-runs/pr$N-$TS"
  git -C "$PRREPO" worktree add -q --detach "$DIR" "$HEADSHA" || { comment "failed: worktree for $HEADSHA failed (Grok Build on Ubuntu, $(pt)). log $LOGDIR"; exit 1; }
  RBASE="$HEADSHA"
  say "pr mode: #$N state $PRSTATE head $BR $HEADSHA base $PRBASE worktree $DIR (draft stays draft; no ready, no merge)"
fi
cd "$DIR" || { comment "failed: launch error (Grok Build on Ubuntu, $(pt)): checkout $DIR missing"; exit 1; }
[ "$MODE" = pr ] || BR=$(git rev-parse --abbrev-ref HEAD)
HARD_START=$(git rev-parse HEAD)
[ "$MODE" = pr ] || PRBASE="$BASE"
REASON=""
CAPHIT=""
AHEAD=0
BAD=""
for ATTEMPT in 1 2; do
  if [ -n "$CAPHIT" ]; then say "attempt 1 hit the $MAXTURNS-turn cap; no second attempt"; break; fi
  SID=$(python3 -c 'import uuid;print(uuid.uuid4())')
  P="$LOGDIR/prompt-$ATTEMPT.md"; cp "$PROMPT_IN" "$P"; printf "

Rules: do not open or read image files (png, jpg, gif, webp); screenshot checks belong to Hermes. If you have not made a code edit within 25 turns, stop and say why.
" >> "$P"
  if [ "$ATTEMPT" = 2 ]; then printf '\n\n## Retry\nAttempt 1 failed: %s\nThe working tree still holds attempt 1 state. Fix the problem and finish.\n' "$REASON" >> "$P"; fi
  OUT="$LOGDIR/grok-$ATTEMPT.ndjson"
  say "attempt $ATTEMPT session $SID model $MODEL max-turns $MAXTURNS"
  G0=$(date +%s)
  timeout 45m "$GROK" --prompt-file "$P" --cwd "$DIR" --always-approve --no-plan \
      --model "$MODEL" --session-id "$SID" --output-format streaming-json --max-turns "$MAXTURNS" >"$OUT" 2>"$LOGDIR/grok-$ATTEMPT.err" </dev/null &
  GPID=$!
  sleep 8
  if kill -0 "$GPID" 2>/dev/null || { wait "$GPID"; RC0=$?; [ "$RC0" = 0 ]; }; then
    if [ "$ATTEMPT" = 1 ]; then W="started${RUN_NOTE:+ $RUN_NOTE}"; else W="retry started (attempt 2)"; fi
    comment "$W (Grok Build on Ubuntu, $(pt)), direct from dr eggbot, session $SID, model $MODEL, log $LOGDIR"
  else
    ERR=$(tail -c 400 "$LOGDIR/grok-$ATTEMPT.err" | tr '\n' ' ')
    comment "launch error (Grok Build on Ubuntu, $(pt)), attempt $ATTEMPT, rc=$RC0: ${ERR:-no stderr}. log $LOGDIR"
    REASON="launch error rc=$RC0"; GROK_WALL=$((GROK_WALL + $(date +%s) - G0)); continue
  fi
  wait "$GPID" 2>/dev/null; RC=$?
  GROK_WALL=$((GROK_WALL + $(date +%s) - G0))
  say "grok exit rc=$RC"
  note_usage "$OUT"
  GERR=""
  if [ "$RC" = 124 ]; then GERR="Grok Build timed out after 45m";
  elif [ "$RC" != 0 ]; then GERR="Grok Build exited rc=$RC: $(python3 "$HOME/bin/grok-err-reason.py" "$LOGDIR/grok-$ATTEMPT.err" "$OUT")"; fi
  [ -n "$GERR" ] && say "$GERR"
  if grep -q '"type":"max_turns_reached"' "$OUT" 2>/dev/null; then CAPHIT=1; HARD_CAPHIT=1; GERR="${GERR:+$GERR; }hit the $MAXTURNS-turn cap"; say "attempt $ATTEMPT hit the $MAXTURNS-turn cap"; fi
  ensure_identity
  if [ -n "$(git status --porcelain)" ]; then
    if [ -n "$CAPHIT" ]; then
      git add -A && git commit -qm "$(cap_commit_subject "$N" "$MAXTURNS")"
    else
      git add -A && git commit -qm "#$N: Grok Build changes (auto-commit by wrapper)"
    fi
  fi
  AHEAD=$(git rev-list --count "$RBASE..HEAD")
  CHANGED=$(git diff --name-only "$RBASE...HEAD")
  if [ "$AHEAD" = 0 ]; then REASON="${GERR:-no changes produced}"; say "$REASON"; continue; fi
  BAD=$(printf '%s\n' "$CHANGED" | paths_forbidden "$MODE")
  if [ -n "$BAD" ]; then REASON="touched forbidden paths: $(printf '%s' "$BAD" | tr '\n' ' ')"; say "$REASON"; continue; fi
  TFAIL=""
  for t in $(printf '%s\n' "$CHANGED" | grep -E '^scripts/test_.*\.mjs$' || true); do
    [ -f "$t" ] || continue
    if timeout 180 node "$t" >"$LOGDIR/test-$ATTEMPT-$(basename "$t").log" 2>&1; then say "test ok $t"; else TFAIL="$TFAIL $t"; fi
  done
  if [ "$MODE" = issue ] && [ -z "$(printf '%s\n' "$CHANGED" | grep -E '^scripts/test_.*\.mjs$' || true)" ]; then REASON="${GERR:+$GERR (before a test was added)}"; REASON="${REASON:-no scripts/test_*.mjs added or changed}"; say "$REASON"; continue; fi
  if [ -n "$TFAIL" ]; then REASON="tests failing:$TFAIL${GERR:+ ($GERR)}"; say "$REASON"; continue; fi
  REASON=""; break
done
# A turn-cap hit with allowable commits is pushed, with a clear message, instead of exiting empty.
if [ -n "$CAPHIT" ] && [ -n "$REASON" ] && [ "${AHEAD:-0}" != 0 ] && [ -z "${BAD:-}" ]; then
  PARTIAL=1
  REASON=""
  say "turn cap hit; pushing allowable partial work"
fi
if [ "$MODE" = pr ] && [ -n "$REASON" ]; then
  comment "failed: $REASON (Grok Build on Ubuntu, PR #$N head $HEADSHA, $(pt)). No relabel, no kickback, draft unchanged. log $LOGDIR"
  exit 1
fi
if [ -n "$REASON" ] && [ -n "$CAPHIT" ]; then
  python3 "$GHAPI" tocursor "$N" || say "tocursor relabel failed"
  comment "Grok Build hit its $MAXTURNS-turn cap without a passing result ($REASON). No second local attempt. Relabeled executor:cursor + status:ready so the Ubuntu cron launches Cursor. (Grok Build on Ubuntu, $(pt)). log $LOGDIR"
  exit 1
fi
if [ -n "$REASON" ]; then
  python3 "$GHAPI" kickback "$N" || true
  comment "failed: $REASON (Grok Build on Ubuntu, 2 local attempts, $(pt)). log $LOGDIR"
  comment "kickback: $REASON after 2 local Grok Build attempts. Relabeled executor:cursor + kickback."
  exit 1
fi

do_push() {
  local flags="" dest="$1"
  if push_refused "$dest" "$PRBASE" "$flags"; then
    comment "failed: refusing push to $dest (main, base, or force). nothing pushed (Grok Build on Ubuntu, $(pt)). log $LOGDIR"
    exit 1
  fi
  # The refspec is a fast-forward update of the existing branch. No --force and no leading +.
  if ! git push origin "HEAD:refs/heads/${dest}" >"$LOGDIR/push.log" 2>&1; then
    python3 -c 'import sys, pathlib; p=pathlib.Path(sys.argv[1]); tok=pathlib.Path.home().joinpath(".config/tsv-gateb/gh-token"); t=p.read_text(errors="replace") if p.exists() else "";
s=""
try:
    s=tok.read_text().strip()
except Exception:
    s=""
if s: t=t.replace(s,"***")
if p.exists(): p.write_text(t)
' "$LOGDIR/push.log" || true
    comment "failed: push to $dest was rejected (Grok Build on Ubuntu, $(pt)). log $LOGDIR"
    exit 1
  fi
  HARD_PUSHED=1
}

if [ "$MODE" = pr ]; then
  if [ "$(git ls-remote origin "refs/heads/$BR" | cut -f1)" != "$HEADSHA" ] || ! git merge-base --is-ancestor "$HEADSHA" HEAD; then
    comment "failed: $BR moved off $HEADSHA or is not a fast-forward; nothing pushed (Grok Build on Ubuntu, $(pt)). log $LOGDIR"; exit 1
  fi
  do_push "$BR"
  NEWSHA=$(git rev-parse HEAD)
  poll_ci_and_gateb "$NEWSHA"
  if [ "$PARTIAL" = 1 ]; then
    comment "hit the $MAXTURNS-turn cap; committed and pushed partial work $NEWSHA to $BR (fast-forward from $HEADSHA; draft unchanged; Grok Build on Ubuntu, $(pt)). CI $HARD_CI. Gate B $HARD_GATEB. log $LOGDIR"
  else
    comment "finished: pushed $NEWSHA to $BR (fast-forward from $HEADSHA; draft unchanged; Grok Build on Ubuntu, $(pt)). CI $HARD_CI. Gate B $HARD_GATEB. log $LOGDIR"
  fi
  say "done pr #$N $NEWSHA ci=$HARD_CI gateb=$HARD_GATEB"
  exit 0
fi
do_push "$BR"
NEWSHA=$(git rev-parse HEAD)
poll_ci_and_gateb "$NEWSHA"
if [ "$PARTIAL" = 1 ]; then
  comment "hit the $MAXTURNS-turn cap; committed and pushed partial work $NEWSHA to $BR (Grok Build on Ubuntu, $(pt)). No PR opened from a partial cap hit. CI $HARD_CI. Gate B $HARD_GATEB. log $LOGDIR"
  say "partial cap push $NEWSHA"
  exit 0
fi
TITLE=$(git log --reverse --format=%s "origin/$BASE..HEAD" | grep -v "auto-commit by wrapper" | head -1); TITLE="${TITLE:-$(git log -1 --format=%s)}"; TITLE="${TITLE#\#$N: }"
FILES=$(printf '%s\n' "$CHANGED" | sed 's/^/- `/; s/$/`/')
URL=$(python3 "$GHAPI" pr "$BR" "$BASE" "#$N: $TITLE" "Fixes #$N

Grok Build (Ubuntu, Jev) run started directly by dr eggbot. Wrapper-gated: issue mode still refuses routes/, src/, baselines/, ratchet, secrets and Vercel changes; changed scripts/test_*.mjs pass locally.

Files:
$FILES") || { comment "failed: branch $BR pushed but PR create failed ($(pt)). log $LOGDIR"; exit 1; }
comment "finished: PR $URL (Grok Build on Ubuntu, $(pt)). CI $HARD_CI. Gate B $HARD_GATEB."
say "done $URL"
