  grok-ubuntu)
    if [ "${VK_JOB_MODE:-code}" != read-only-prep ] && [ ! -f scripts/check-no-comments.mjs ]; then
      echo "$(ts) REFUSE $LANE: required no-comments checker missing; harness prerequisite, no coder try" | tee -a "$LOG"; rc=3; return
    fi
    GROK_BIN="${VK_GROK_BIN:-$HOME/.local/bin/grok}"
    case "$GROK_BIN" in *grok-issue-run*) echo "$(ts) REFUSE $LANE: legacy grok-issue-run.sh not allowed" | tee -a "$LOG"; exit 3 ;;
    esac
    # dr eggbot 3:30 PM PT 11/2 (bell-gate-1793661401838751416): acceptEdits with no Bash allow rules made every grok code round
    # die in seconds ("permission required ... headless run cannot ask"), e.g. vkfill-550 2:55 PM PT. Same safe set as claude-ubuntu; git writes stay denied.
    # Craig 11/9 follow-up: narrow Bash(…) allowlist still prompts on compound commands
    # even with --always-approve ("permission required ... headless cannot ask").
    # Use Bash(*) + bypassPermissions; keep git-mutation and jev_decision denies.
    GROK_READ=(--allow "Bash(*)" --allow "Read(*)" --allow "Write(*)" --allow "Edit(*)" --allow "Glob(*)" --allow "Grep(*)")
    if [ "${VK_JOB_MODE:-code}" = read-only-prep ]; then
      GROK_READ=(--allow "Bash(date *)" --allow "Bash(sha256sum *)" --allow "Bash(git -C $WD rev-parse *)" --allow "Bash(git -C $WD status *)" --allow "Bash(git -C $WD cat-file *)" --allow "Bash(git -C $WD log *)")
    fi
    PROMPT="$D/$TAG-grok-prompt.md"
    GROK_NOJEV="Coder-lane ban (Craig 11/9): Do NOT invoke gbrain skill timesyncher-jev-decision-router, do NOT run jev_decision.py or any ~/gbrain/skills/*jev* script. That skill is for chat/routing only, not coder rounds. Stay native grok-4.7 in this worktree; no OpenRouter, no Jev."
    # dr eggbot 2:10 PM PT 11/9: with deny rules present, grok's headless checker refuses any Bash it cannot parse (command
    # substitution, eval, inline scripts): "No user is available to approve ... could not be checked" even with --always-approve.
    GROK_BASH="Headless Bash rule: run plain commands only. No command substitution (\$(...) or backticks), no eval, no inline scripts (python -c, node -e, heredocs); name files explicitly and use read_file/grep/list_dir for reading. git commit/push/merge/rebase/reset are denied; the host commits and publishes."
    { printf "%s\n\n%s\n\n%s\n\n" "$PRE" "$GROK_NOJEV" "$GROK_BASH"; cat "$1"; } > "$PROMPT"
    # Craig follow-up 2:01 PM PT 11/9: acceptEdits+allowlist still dies on compound Bash
    # ("permission required ... headless run cannot ask"). Use documented --always-approve;
    # keep git mutation denies for host publication. Native grok-4.7 only (no Jev/OpenRouter).
    # No --deny flags: headless grok fail-closes unparseable Bash when any deny is set
    # (eggbot 2:10 PM PT 11/9). Ban git push/jev via PRE+rules only; host publishes.
    timeout 7200 "$GROK_BIN" --prompt-file "$PROMPT" --cwd "$WD" --no-plan \
      --model grok-4.7 --max-turns 40 --no-subagents --always-approve \
      --permission-mode bypassPermissions --rules "$GROK_NOJEV $GROK_BASH" "${GROK_READ[@]}" \
      --output-format streaming-json < /dev/null > "$D/$TAG-grok.ndjson" 2>> "$D/$TAG-runner.log"; rc=$? ;;
  *)
