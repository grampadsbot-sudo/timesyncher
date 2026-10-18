#!/bin/bash
# gpt-window-run.sh: GPT/Codex counterpart of r102c-run.sh (Craig 2026-10-17 1:46 PM PT).
# Checks the Codex meter before each session and stops when it is not allowed; resumes the SAME
# codex session for up to MAX_SESSIONS two-hour sessions; the brief preamble makes the model push
# as soon as the branch beats base and after every improving round (never force-push), push its
# best work before quota runs out, then write the receipt and the DONE file.
# Usage: gpt-window-run.sh <job-dir> <tag> <brief-file> <workdir> <effort> [extra-writable-dir ...]
# Env: RESUME_SID (continue an existing codex session), MAX_SESSIONS (6), SESSION_SECS (7200), QUOTA_STOP_PCT (95)
set -u
[ $# -ge 5 ] || { echo "usage: $0 <job-dir> <tag> <brief-file> <workdir> <effort> [extra-dir...]" >&2; exit 2; }
D=$1; TAG=$2; BRIEF=$3; WD=$4; EFFORT=$5; shift 5
MODEL=gpt-6.1-sol
case "$EFFORT" in low|medium|high|xhigh) ;; *) echo "effort must be low|medium|high|xhigh" >&2; exit 2;; esac
MAX=${MAX_SESSIONS:-6}; SECS=${SESSION_SECS:-7200}; STOP=${QUOTA_STOP_PCT:-95}
export PATH="$HOME/.npm-global/bin:$HOME/.bun/bin:$HOME/.local/bin:$PATH"
unset OPENAI_API_KEY OPENAI_BASE_URL OPENROUTER_API_KEY
BIN=$(dirname "$(readlink -f "$0")")/bin
LOG="$D/$TAG-runner.log"; DONE="$D/$TAG-DONE"; SIDF="$D/$TAG-session-id"
ts() { date -u +%FT%TZ; }
cd "$WD" || { echo "$(ts) no workdir $WD" >> "$LOG"; exit 1; }
ROOTS="\"$D\""; ADD=(--add-dir "$D"); for a in "$@"; do ADD+=(--add-dir "$a"); ROOTS="$ROOTS,\"$a\""; done
PRE="Runner rules (gpt-window-run.sh, Craig 2026-10-17): model $MODEL only; no other model, no OpenRouter, no paid fallback. Push to the PR branch as soon as it beats base and after every improving round; never force-push. When quota or time is close, push your best work first. Protected host boundary: if Git metadata is read-only or sudo reports uid65534/no-new-privileges inside the worker, stop and preserve the patch; do not chmod, broaden writable roots, extract credentials, or retry privileged operations. Write the canonical blocked receipt with the exact failed path and ask the live Mac managing dr for outer-SSH publication or result-bell delivery. That worker sandbox view is not proof of host ownership drift. When finished, blocked, or near the limit, write the receipt the brief names, then write one line to $DONE: 'result <short outcome> <pushed tip sha>'."
if [ "${VK_HOST_PUBLICATION_ONLY:-0}" = 1 ]; then
  PRE="Runner rules: model $MODEL only; no other model, OpenRouter or paid fallback. HOST PUBLICATION ONLY: edit source/test files only inside the supplied worktree and job directory. Git metadata is deliberately read-only; do not probe for Git write access and do not commit, push, merge, rebase, stage or mutate Git metadata. The outer host owns all Git mutations and publication. Do not invoke sudo, chmod, add writable roots, extract credentials or retry privileged operations. If a SOURCE write fails, stop and preserve the proposed patch in the job directory; report the exact failed source path. Read-only git status/diff/show are allowed. Preserve all gates, scope, quota and ownership requirements. When finished or blocked, write the requested receipt, then one line to $DONE: result <outcome> <actual starting HEAD>; report source changes as uncommitted for host review."
fi
SID=${RESUME_SID:-}; [ -z "$SID" ] && [ -s "$SIDF" ] && SID=$(cat "$SIDF")
echo "$(ts) runner start tag=$TAG model=$MODEL effort=$EFFORT resume=${SID:-new}" >> "$LOG"
for i in $(seq 1 "$MAX"); do
  [ -f "$DONE" ] && break
  q=$(python3 -I "$BIN/codex-quota.py" 2>&1)
  echo "$(ts) session-run $i quota: $q" >> "$LOG"
  python3 -I -c 'import json,sys
q=json.loads(sys.argv[1]); s=float(sys.argv[2])
ok=q["primary"]["usedPercent"]<s and q["secondary"]["usedPercent"]<s and not q.get("spendControlReached") and not q.get("rateLimitReachedType")
sys.exit(0 if ok else 1)' "$q" "$STOP" 2>/dev/null || { echo "$(ts) quota not allowed, stop" >> "$LOG"; break; }
  OUT="$D/$TAG-session-$i.jsonl"
  if [ -z "$SID" ]; then
    timeout "$SECS" codex exec -C "$WD" "${ADD[@]}" --skip-git-repo-check -m "$MODEL" -c model_reasoning_effort="$EFFORT" \
      --json -o "$D/$TAG-last-$i.txt" "$PRE

$(cat "$BRIEF")" < /dev/null > "$OUT" 2>> "$LOG"
    rc=$?
    SID=$(python3 -I -c 'import json,sys
for l in open(sys.argv[1]):
  try: d=json.loads(l)
  except Exception: continue
  t=d.get("thread_id") or d.get("session_id")
  if t: print(t); break' "$OUT" 2>/dev/null)
    [ -n "$SID" ] && echo "$SID" > "$SIDF"
  else
    timeout "$SECS" codex exec resume "$SID" --skip-git-repo-check -m "$MODEL" -c model_reasoning_effort="$EFFORT" \
      -c "sandbox_workspace_write.writable_roots=[$ROOTS]" --json -o "$D/$TAG-last-$i.txt" \
      "$PRE Continue the same task. Re-read $BRIEF and obey its publication boundary." < /dev/null > "$OUT" 2>> "$LOG"
    rc=$?
  fi
  python3 -I "$BIN/codex-summ.py" "$OUT" "$rc" "$D/$TAG-last-$i.txt" >> "$LOG"
  [ -z "$SID" ] && { echo "$(ts) no session id captured, stop" >> "$LOG"; break; }
done
if [ -f "$DONE" ]; then done_line=$(cat "$DONE"); else done_line=none; fi
echo "$(ts) runner end done=$done_line" >> "$LOG"
