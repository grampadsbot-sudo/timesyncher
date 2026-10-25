# #567 source handback

Outcome: source-ready, uncommitted for host review. Actual starting and remaining HEAD: `f7be729670c183c4f04802040a170a38ba0e5aec`. No Git metadata mutation, publication, runtime installation, notification, merge or deployment performed. Issue completion and green PR-head CI remain host work; this receipt does not close the issue or certify the runtime.

Authority: `bot-admin/requests/eggbot-host-supervisor-gapratchet-549-562-20261020-0200`, item 10(c); continuation `bot-admin/requests/gpt-pass-20261020-0453-watchdog`. Read the current decisions log, required SoTs, engineer process and verification skill pages through the local GBrain CLI. The unsuccessful get_skill lookup was resolved through the existing `skills/tsv-engineer-pr-process/skill` page. No pstack or additional agents used.

Changes:

- Track the existing host alarm and issue-link dependency in `scripts/ops/dispatch/tsv_stall_alarm.py` and `pr_issue_links.py`; the starting repo contains neither. Runtime preimage SHA-256: `838ff94bd4f0be7b62e2a7bf16f4ddcbf7c76188d31a60e3722b3a1df3924b37`. Preserve existing non-handback paths and guards.
- Add `host_handback_review.py`: recognize the latest host-authored review handback and host-authored draft acceptance NOT RUN, measure 20 minutes from the event timestamp, route through the existing managing-dr-first `bell_gate` ladder, deduplicate by item/head/event and preserve a rolling hourly per-item action budget.
- Handle handbacks before generic fixes and before recorded active flags hide an issue. A real lane process still owns it. Preserve needs-craig and hold labels; recognize Refs ownership to avoid a duplicate issue action. Closed objects and superseded review markers are excluded. Relay errors have no coder or Gate B fallback.
- Make dry-run logging read-only and guard expired-claim directory creation. Extend existing relevant Python test file `test_vk_live_row_check.py`; no new test file or manifest edit is needed.

Verification on uncommitted source from `f7be729670c183c4f04802040a170a38ba0e5aec`:

- PASS: `PYTHONDONTWRITEBYTECODE=1 python3 scripts/ops/dispatch/test_vk_live_row_check.py` — 18 tests, including 12 watchdog regressions. Evidence: job `focused-tests.log`; start `f7be729670c183c4f04802040a170a38ba0e5aec`.
- PASS: `node scripts/check-no-comments.mjs` — 868 files. Evidence: job `no-comments.log`; start `f7be729670c183c4f04802040a170a38ba0e5aec`. Initial execution lacked TypeScript; restored the existing locked 5.9.3 from local cache, with no package or lockfile change.
- PASS: `node scripts/test_offline_manifest.mjs` — 295 offline / 17 online. Evidence: job `offline-manifest.log`; start `f7be729670c183c4f04802040a170a38ba0e5aec`.
- PASS: `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — 255 report / 0 fail. Evidence: job `code-ratchet.log`; start `f7be729670c183c4f04802040a170a38ba0e5aec`.
- PASS: `git diff --check` and Python AST parsing of all four changed source/test files. Evidence: job `diff-check.log`, `source-manifest.json`; start `f7be729670c183c4f04802040a170a38ba0e5aec`.
- Reproduced both incorrect actions with the unchanged host alarm, synthetic objects and temporary files: acceptance NOT RUN -> Gate B re-run forced; host review required -> issue requeued for a free lane. Evidence: job `baseline_reproduction.py`, `baseline-reproduction.log`; runtime preimage hash above.
- Live read-only CLI scan at 2026-10-25T17:55:15Z: `PYTHONDONTWRITEBYTECODE=1 python3 <job>/live_host_dry_run.py`. Used public GitHub GETs, the source alarm's `--dry` entrypoint, real runtime state and a filesystem audit guard rejecting mutations outside the job directory. Scanned 13 open PRs and 35 open issues; 44 GETs, no credentials used. Runtime state/log hashes were unchanged. Evidence: job `live-host-dry-run.log`, `live-host-api-snapshot.json`; start `f7be729670c183c4f04802040a170a38ba0e5aec`.

Live proof limit: #565, #566 and #569 are now closed and were not replayed. No current open item matched the handback markers: the live scan proves safe current-queue integration, while regressions prove acceptance routing. It does not prove a delivered managing-dr action or actual acceptance completion. Runtime remains uninstalled pending host review.

Scope left alone: current generic stall findings and unrelated CI/Gate B failures in the live queue. No UI, checker, capture, fixture, baseline, workflow, deploy, dependency manifest or secret changes. No UI screenshot or Gate B execution is appropriate to this operations-only source change. No CI run was started, restarted or claimed green.

Host handoff: review `source.patch` and `source-manifest.json` in `/home/ubishere9995/tsv-work/vkfill-567-20261025104827-job`; publish one draft into `migrate/trek-source` with `Closes #567` using `PR_DESCRIPTION.md`, then obtain green CI on that published head. Review the bounded live proof before any installation. The worker has not claimed issue acceptance.
