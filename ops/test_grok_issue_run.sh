#!/usr/bin/env bash
# Smoke test for grok-issue-run.sh guards: draft PR, src/ allowed on --pr, forbidden paths refused.
set -u
ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SCRIPT="$ROOT/grok-issue-run.sh"
[ -f "$SCRIPT" ] || SCRIPT="$ROOT/scripts/ops/grok-issue-run.sh"
fail=0
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    printf 'ok  %s\n' "$name"
  else
    printf 'FAIL %s (got %s want %s)\n' "$name" "$got" "$want"
    fail=1
  fi
}
bash -n "$SCRIPT" || { echo "FAIL bash -n"; exit 1; }
printf 'ok  bash -n\n'
GROK_ISSUE_RUN_LIB=1
# shellcheck disable=SC1090
source "$SCRIPT"

pr_runnable_state draft; check "draft PR runs" "$?" 0
pr_runnable_state open; check "open PR runs" "$?" 0
pr_runnable_state closed; check "closed PR refused" "$?" 1
pr_runnable_state merged; check "merged PR refused" "$?" 1

path_forbidden pr "src/vacation/grok-build-throwaway-proof.mjs"; check "pr allows src/" "$?" 1
path_forbidden issue "src/vacation/foo.mjs"; check "issue refuses src/" "$?" 0
path_forbidden pr ".github/workflows/vacation-verify.yml"; check "pr refuses .github CI" "$?" 0
path_forbidden pr "vercel.json"; check "pr refuses vercel.json" "$?" 0
path_forbidden pr ".vercel/project.json"; check "pr refuses .vercel" "$?" 0
path_forbidden pr "baselines/nyc/a.png"; check "pr refuses baselines/" "$?" 0
path_forbidden pr "scripts/code-ratchet-baseline.json"; check "pr refuses ratchet baseline" "$?" 0
path_forbidden pr "scripts/check-code-ratchet.mjs"; check "pr refuses ratchet checker" "$?" 0
path_forbidden pr "scripts/fixtures/sort-buttons-baselines/README.md"; check "pr refuses baseline fixtures" "$?" 0
path_forbidden pr "apps/vacation-client/eslint.config.js"; check "pr refuses eslint config" "$?" 0
path_forbidden pr ".env"; check "pr refuses .env" "$?" 0
path_forbidden pr "secrets/token.pem"; check "pr refuses secret pem" "$?" 0
path_forbidden pr "scripts/check-evidence-secrets.mjs"; check "pr refuses secrets scanner" "$?" 0
path_forbidden pr "routes/vacation.mjs"; check "pr still refuses routes/" "$?" 0

bad=$(printf '%s\n' "src/vacation/a.mjs" ".github/workflows/vacation-verify.yml" | paths_forbidden pr)
check "mixed diff reports only the CI file" "$(printf '%s' "$bad" | tr -d '\n')" ".github/workflows/vacation-verify.yml"
src_only=$(printf '%s\n' "src/vacation/a.mjs" | paths_forbidden pr)
check "src-only diff is empty forbid list" "$src_only" ""

reason=$(hold_block_reason $'project:tsv\nhold:dr-diagnosis' "/tmp/grok-issue-run-stop-missing-$$")
check "hold:dr-diagnosis does not block" "$reason" ""
# CURSOR_STOP exists on this host. The guard must not be pointed at it.
cursor_stop="$HOME/tsv-dispatch/CURSOR_STOP"
if [ -f "$cursor_stop" ]; then
  reason=$(hold_block_reason "hold:dr-diagnosis" "/tmp/grok-issue-run-stop-missing-$$")
  check "CURSOR_STOP file is not the --pr stop switch" "$reason" ""
fi
reason=$(hold_block_reason $'hold:dr-diagnosis\nkickback' "/tmp/grok-issue-run-stop-missing-$$")
check "kickback blocks" "$reason" "kickback"
reason=$(hold_block_reason "status:stop" "/tmp/grok-issue-run-stop-missing-$$")
check "status:stop blocks" "$reason" "explicit stop"
stop=$(mktemp)
reason=$(hold_block_reason "hold:dr-diagnosis" "$stop")
check "explicit stop file blocks" "$reason" "explicit stop"
rm -f "$stop"
reason=$(hold_block_reason "hold:trek-migration" "/tmp/grok-issue-run-stop-missing-$$")
check "other hold blocks" "$reason" "hold hold:trek-migration"

push_refused "grok/throwaway-pr-proof" "migrate/trek-source" ""; check "PR head push allowed" "$?" 1
push_refused "main" "migrate/trek-source" ""; check "main push refused" "$?" 0
push_refused "master" "migrate/trek-source" ""; check "master push refused" "$?" 0
push_refused "migrate/trek-source" "migrate/trek-source" ""; check "base push refused" "$?" 0
push_refused "grok/throwaway-pr-proof" "migrate/trek-source" "--force"; check "force push refused" "$?" 0
push_refused "grok/throwaway-pr-proof" "migrate/trek-source" "-f"; check "-f push refused" "$?" 0

check "turn cap default" "$(turn_cap_default)" "40"
subj=$(cap_commit_subject 999 40)
check "cap commit names the cap" "$subj" "#999: Grok Build hit the 40-turn cap; partial work auto-committed by wrapper"

# The live --pr path must not mark ready, merge, or force-push.
if grep -E 'ready_for_review|/merges|push[[:space:]]+--force|push[[:space:]]+-f|HEAD:refs/heads/\+' "$SCRIPT" >/dev/null; then
  echo "FAIL script contains ready/merge/force push"
  fail=1
else
  echo "ok  no ready, merge, or force-push"
fi
if ! grep -q 'tsv-dispatch/GROK_STOP' "$SCRIPT"; then
  echo "FAIL explicit stop is not GROK_STOP"
  fail=1
else
  echo "ok  explicit stop file is GROK_STOP"
fi
if grep -n 'hold_block_reason' "$SCRIPT" | grep -q 'CURSOR_STOP'; then
  echo "FAIL hold check is wired to CURSOR_STOP"
  fail=1
else
  echo "ok  hold check is not wired to CURSOR_STOP"
fi
if ! grep -q 'GROK_MAX_TURNS:-40' "$SCRIPT"; then
  echo "FAIL turn cap is not configurable with default 40"
  fail=1
else
  echo "ok  turn cap configurable default 40"
fi
if ! grep -q 'hard-round-comparison.jsonl' "$SCRIPT"; then
  echo "FAIL comparison log path missing"
  fail=1
else
  echo "ok  comparison log path"
fi

if [ "$fail" = 0 ]; then
  echo "PASS"
  exit 0
fi
echo "FAILED"
exit 1
