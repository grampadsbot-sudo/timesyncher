#!/bin/bash
set -u
[ "$#" -ge 5 ] || { echo "usage: $0 <lane> <job-dir> <tag> <brief> <worktree> [effort]" >&2; exit 2; }
LANE=$1; D=$2; TAG=$3; BRIEF=$4; WD=$5; EFFORT=${6:-medium}
L=${VK_LANES:-$HOME/tsv-dispatch/lanes}; CFG=$L/lanes.json; SL=$L/slots; mkdir -p "$SL" "$D"
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/bin:$PATH"
unset OPENAI_API_KEY OPENAI_BASE_URL OPENROUTER_API_KEY ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
export npm_config_cache=$HOME/.npm npm_config_prefer_offline=true
LOG=$L/lane-run.log; ts() { TZ=America/Los_Angeles date '+%F %T %Z'; }
[ -d "$WD/.git" ] || [ -f "$WD/.git" ] || { echo "$(ts) REFUSE $LANE $TAG: $WD is not a git worktree" | tee -a "$LOG"; exit 3; }
meter() {
  case $1 in
    gpt) q=$(python3 -I "$HOME/tsv-dispatch/bin/codex-quota.py" 2>&1); python3 -I -c 'import json,sys
c=json.load(open(sys.argv[2]))["meters"]["gpt"]
try: q=json.loads(sys.argv[1])
except Exception: print("no unreadable"); sys.exit()
p,s=q["primary"]["usedPercent"],q["secondary"]["usedPercent"]
ok=p<c["stop_pct_5h"] and s<c["stop_pct_week"] and not q.get("spendControlReached") and not q.get("rateLimitReachedType")
print(("ok" if ok else "no")+" gpt 5h=%s%% week=%s%%"%(p,s))' "$q" "$CFG";;
    claude) u=$("$HOME/bin/claude-usage" 2>&1); python3 -I -c 'import json,re,sys
c=json.load(open(sys.argv[2]))["meters"]["claude"]; m=re.search(r"5h (\d+)%.*7d (\d+)%.*status (\w+)",sys.argv[1])
if not m: print("no unreadable"); sys.exit()
p,s,st=int(m[1]),int(m[2]),m[3]
print(("ok" if p<c["stop_pct_5h"] and s<c["stop_pct_week"] and st=="allowed" else "no")+" claude 5h=%d%% week=%d%%"%(p,s))' "$u" "$CFG";;
    cursor) echo "ok cursor meter unreadable (group capped at its max_jobs)";;
    *) echo "no unknown meter";;
  esac
}
exec 9>"$L/.gate.lock"; flock 9
for f in "$SL"/*.slot; do [ -e "$f" ] || continue; pid=$(sed -n 's/^pid=//p' "$f"); host=$(sed -n 's/^host=//p' "$f")
  [ "$host" = "$(hostname)" ] && ! kill -0 "$pid" 2>/dev/null && rm -f "$f"; done
G=$(python3 -I - "$CFG" "$SL" "$LANE" <<'PY'
import json,sys,glob
cfg,sl,lane=json.load(open(sys.argv[1])),sys.argv[2],sys.argv[3]
L=cfg["lanes"].get(lane)
if not L: print("no unknown-lane"); sys.exit()
slots=[dict(l.strip().split("=",1) for l in open(f) if "=" in l) for f in glob.glob(sl+"/*.slot")]
n_l=sum(s.get("lane")==lane for s in slots); n_g=sum(s.get("meter")==L["meter"] for s in slots); n_m=sum(s.get("machine")==L["machine"] for s in slots)
cap_g=cfg["meters"][L["meter"]]["max_jobs"]; cap_m=cfg["machine_cap"][L["machine"]]["max_jobs"]
why=[]
if not L["enabled"]: why.append("lane switched off")
if n_l>=L["max_jobs"]: why.append("lane full %d/%d"%(n_l,L["max_jobs"]))
if n_g>=cap_g: why.append("meter group %s full %d/%d"%(L["meter"],n_g,cap_g))
if n_m>=cap_m: why.append("machine %s full %d/%d"%(L["machine"],n_m,cap_m))
print(("no " if why else "ok ")+L["meter"]+" "+L["machine"]+" "+L["model"]+" | "+("; ".join(why) or "lane %d/%d group %d/%d machine %d/%d"%(n_l,L["max_jobs"],n_g,cap_g,n_m,cap_m)))
PY
)
set -- $G; [ "$1" = ok ] || { echo "$(ts) REFUSE $LANE $TAG: ${G#no }" | tee -a "$LOG"; exit 3; }
METER=$2; MACHINE=$3; MODEL=$4
M=$(meter "$METER"); [ "${M%% *}" = ok ] || { echo "$(ts) REFUSE $LANE $TAG: meter ${M#no }" | tee -a "$LOG"; exit 3; }
echo "$(ts) START $LANE $TAG model=$MODEL effort=$EFFORT wd=$WD | ${G#ok } | ${M#ok }" | tee -a "$LOG"
[ "${DRY_RUN:-0}" = 1 ] && { echo "$(ts) DRY_RUN $LANE $TAG gates passed" | tee -a "$LOG"; exit 0; }
SLOT=$SL/$LANE-$TAG.slot
printf 'lane=%s\nmeter=%s\nmachine=%s\ntag=%s\nhost=%s\npid=%s\nstarted=%s\n' "$LANE" "$METER" "$MACHINE" "$TAG" "$(hostname)" $$ "$(ts)" > "$SLOT"
flock -u 9; exec 9>&-
trap 'rm -f "$SLOT"' EXIT
PRE="Lane rules (vk-lane-run.sh $LANE, Craig 2026-10-17): model $MODEL only, no other model, no OpenRouter, no paid fallback. Work only inside $WD and $D. Never git push, never force-push, never merge or rebase: commit locally, and the host publishes after DONE. When finished, blocked or near the limit, write the receipt the brief names, then run the pre-DONE gate yourself (node scripts/check-no-comments.mjs, node scripts/test_offline_manifest.mjs and BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs must all pass (no dead exports); the repo forbids code comments and every new scripts/test_*.mjs must be listed in scripts/offline-tests.txt), then write one line to $D/$TAG-DONE: 'result <short outcome> <local tip sha>'."
if [ "${VK_HOST_PUBLICATION_ONLY:-0}" = 1 ]; then
  PRE="Lane rules: $LANE, model $MODEL only; no other model, OpenRouter or paid fallback. HOST PUBLICATION ONLY. Edit source/test files only inside $WD and $D; do not stage, commit, push, merge, rebase or write Git metadata. Read-only Git metadata is expected and is not a source-write failure. All Git mutations belong to the outer host. Do not change sandbox roots or privileges. Preserve all scope, gate, quota and ownership limits. Run applicable source tests and pre-DONE checks; report uncommitted changes to the host in the named receipt and write result <outcome> <actual starting HEAD> to $D/$TAG-DONE. A failed SOURCE write stops work with an exact-path blocked receipt."
fi
cd "$WD" || exit 1
run_lane() {
case $LANE in
  codex-ubuntu) "$HOME/tsv-dispatch/gpt-window-run.sh" "$D" "$TAG" "$1" "$WD" "$EFFORT"; rc=$? ;;
  claude-ubuntu)
    set -a; . "$HOME/.config/claude-code/oauth.env"; set +a
    XT=(); [ -n "${VK_CLAUDE_EXTRA_TOOLS:-}" ] && IFS="|" read -ra XT <<< "$VK_CLAUDE_EXTRA_TOOLS"
    timeout 7200 claude -p --model "$MODEL" --effort "$EFFORT" --add-dir "$D" --permission-mode acceptEdits \
      --allowedTools "Read" "Edit" "Glob" "Grep" "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(git add:*)" "Bash(git commit:*)" "Bash(node:*)" "Bash(npm ci:*)" "Bash(npm run:*)" "Bash(npm test:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(sha256sum:*)" "Bash(mkdir -p:*)" "${XT[@]}" \
      --disallowedTools "Bash(git push:*)" "Bash(git rebase:*)" "Bash(git merge:*)" "Bash(git reset:*)" \
      --output-format stream-json --verbose "$PRE

$(cat "$1")" < /dev/null > "$D/$TAG-claude.jsonl" 2>> "$D/$TAG-runner.log"; rc=$? ;;
  cursor-ubuntu)
    export CURSOR_API_KEY=$(cat "$HOME/.config/tsv-cursor/api-key")
    timeout 7200 cursor-agent -p --trust --force --model "$MODEL" --output-format stream-json "$PRE

$(cat "$1")" < /dev/null > "$D/$TAG-cursor.jsonl" 2>> "$D/$TAG-runner.log"; rc=$?; unset CURSOR_API_KEY ;;
  *) echo "$(ts) REFUSE $LANE: no runner on this host" | tee -a "$LOG"; exit 3 ;;
esac
}
GATE="$HOME/tsv-dispatch/bin/vk-pre-done-gate.sh"
run_lane "$BRIEF"
gr=0
while [ -f "$D/$TAG-DONE" ]; do
  GOUT=$("$GATE" "$WD" 2>&1) && { echo "$(ts) GATE-PASS $LANE $TAG" | tee -a "$LOG"; break; }
  gr=$((gr+1)); mv "$D/$TAG-DONE" "$D/$TAG-DONE.gate-rejected-$gr"; printf "%s\n" "$GOUT" > "$D/$TAG-GATE-FAIL.txt"
  echo "$(ts) GATE-FAIL $LANE $TAG round $gr: $(printf "%s" "$GOUT" | tr "\n" " " | cut -c1-300)" | tee -a "$LOG"
  [ $gr -gt 2 ] && { echo "$(ts) GATE-GIVEUP $LANE $TAG after 2 fix rounds; DONE withheld" | tee -a "$LOG"; break; }
  FIXB="$D/$TAG-gatefix-$gr.md"
  { echo "PRE-DONE GATE FAILED (round $gr). Your DONE was rejected by the host. Fix ONLY these failures in $WD (remove the listed code comments; register every new scripts/test_*.mjs in scripts/offline-tests.txt), re-run both checks until they pass, commit locally, then rewrite the DONE line. Do not change anything else."; echo; echo "$GOUT"; echo; echo "---- original brief ----"; cat "$BRIEF"; } > "$FIXB"
  run_lane "$FIXB"
done
echo "$(ts) END $LANE $TAG rc=$rc done=$(cat "$D/$TAG-DONE" 2>/dev/null || echo none) | after: $(meter "$METER")" | tee -a "$LOG"
