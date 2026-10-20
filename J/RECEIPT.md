# PR #543 — vkfill-543-20261020104728

Starting and final HEAD: `0db35fba3cda83f95cd23332c4182db186fdff0a` (verified before editing; detached checkout). Source changes are **uncommitted for host review**. Host owns publication to `vkfill/335-p3a-wiring-202610190827`; no Git metadata was mutated.

## Result

Source fix ready for host review; PR merge eligibility remains blocked at starting HEAD `0db35fba3cda83f95cd23332c4182db186fdff0a`. This is not a CI-green or Gate B acceptance claim.

## Diagnosis and change

Exact-head [Actions run 39467733549, unit-tests job 118783417110](https://github.com/grampadsbot-sudo/timesyncher/actions/runs/39467733549/job/118783417110) failed in Vacation client quality gates. First substantive error: `src/components/ListSortBar.tsx(14,41): TS2345: Argument of type 'SortKey' is not assignable to parameter of type '"price" | "name"'; '"catalog"' is not assignable` (exit 2). GitHub annotation and job evidence saved as `unit-annotations.json` / `unit-jobs.json` in the job directory.

Reproduced with `npm run typecheck` in apps/vacation-client on the starting HEAD. The previous fix added catalog to SortKey but left `SORT_KEYS.indexOf(sortKey)` accepting only Name/Price.

Only product change: `apps/vacation-client/src/components/ListSortBar.tsx:14`, replace that lookup with `SORT_KEYS.findIndex((key) => key === sortKey)`. Name returns 0, Price returns 1, catalog returns -1 as before. No new button, markup, CSS, list order, keyboard behavior or fixture content. No additional test file; the existing TypeScript check directly reproduces the failure and verifies the fix. Reviewable patch: job `source.patch`.

## Local verification

These results apply to the uncommitted patch atop `0db35fba3cda83f95cd23332c4182db186fdff0a`; machine-readable summary is job `local-checks.json`.

- Client `npm run typecheck` — exit 0 after the reproduced TS2345.
- Client `npm run lint` and `npm run build` — exit 0.
- `CHROME_PATH=/home/ubishere9995/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node apps/vacation-client/test/run-all.mjs` — exit 0, all unit and shell/list/day/budget/detail/keepsake browser checks, 390 and 1280. Full output: job `client-tests.log`. Browser evidence archived under job `browser-artifacts/`; tracked evidence restored byte-for-byte from HEAD. This is local test evidence, not Gate B or approved-baseline acceptance.
- Root `npm run build` — exit 0 (existing bundle-size warning).
- `npm run test:keepsake-style2` — exit 0.
- `node scripts/check-no-comments.mjs` — exit 0, 792 files scanned.
- `node scripts/test_offline_manifest.mjs` — exit 0, 270 offline / 17 online.
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — exit 0, 257 existing reports / 0 failures.
- `git diff --check` — exit 0.

Setup notes: installed only locked dependencies using npm ci with scripts disabled and the cache inside the job directory; no dependency manifest changed. The first pre-DONE invocation lacked TypeScript; the gates completed after installation. The first client-suite invocation also supplied an artifact-root environment variable that its nested unavailable-browser selftest inherits; that attempt failed before actual layout capture. The normal CHROME_PATH-only invocation then completed the full suite without skipping tests or changing any check.

## Remaining prerequisites / exact blocker

- The patch is uncommitted under the host-publication rule, so it has no pushed head or exact-head CI result. Starting-head unit-tests failed in run 39467733549; secrets succeeded in job 118783417232. Host must publish the source change, and normal CI must evaluate the resulting head. No failed CI was restarted or retriggered.
- [PR #543](https://github.com/grampadsbot-sudo/timesyncher/pull/543) currently reports `mergeable=false`, `mergeable_state=dirty`, base `migrate/trek-source` at `2b6d8df06d79916cd07221c9364de32fa4219deb` (saved job `pr.json`). [Chief-dr comment 6297180332](https://github.com/grampadsbot-sudo/timesyncher/pull/543#issuecomment-6297180332) explicitly identifies this conflict and the need for a base-update round. This brief prohibits merging, rebasing or cherry-picking any base into this branch. No conflict repair or Git mutation attempted; host/managing dr must supply a permitted resolution.
- Starting-head Vercel contexts timesyncher, timesyncher-vacation-staging, workspace all fail: `Deployment rate limited — retry in 24 hours.` Saved job `status.json`, status IDs 56813098743 / 56813098693 / 56813098690. No redeploy or privileged workaround attempted. Existing PR comment 6278464110 establishes that local-build Gate B is unaffected by that limit; it does not waive CI requirements.
- Exact-head 32-screen Ubuntu structure Gate B acceptance is not found for 0db35fba in `~/tsv-dispatch/logs/gateb-verdicts.jsonl`. Latest #543 ledger entry is 2026-10-20T08:26:21-07:00 on 31b0f58, NO_VERDICT because 20 managing-dr description judgments were pending. No Gate B round, allowance change or history reset was run. The chief-dr brief's old head findings were already addressed in inherited commits ac2bc4ec / 870e4696 / fd297d1c; they were not guessed at again.

## Authority and GBrain access checked

GBrain CLI route works as the current user: `gbrain get bot-admin/messages/time-syncher/decisions-log`, `gbrain get bot-admin/requests/eggbot-decision-335-port-and-deploy-20261019-1025`, and `gbrain get bot-admin/requests/eggbot-543-base-vs-head-split-then-one-round-20261019-1210` all exited 0. No sudo, credential extraction or fallback model. Required repository SoTs and `skills/keepsake-qa/skill`, `skills/timesyncher-vacation-verification/skill`, `skills/tsv-engineer-pr-process/skill`, `skills/vk-thing-data-contract/skill` loaded; snapshots saved in the job directory. Current comments/checks read through the public GitHub API; snapshots `pr.json`, `comments.json`, `checks.json`, `status.json`.

Governing head/base split excludes shared base failures: `bot-admin/requests/eggbot-543-base-vs-head-split-then-one-round-20261019-1210`; separate base gaps: `bot-admin/requests/543-base-gap-vs-staging-20261019-1226`. #562 sign-off route checked at `bot-admin/requests/562-harness-signoff-20261020`; current comment 6294207592 lifts the prior #562 hold, so that historical hold is not asserted here. The current dispatch authorizes this scoped round; old two-failure comments were not used as a reason to refuse work.

## Left alone

Fixtures, reference/baseline images, Gate B/capture/harness scripts, thresholds/allowlists/ratchets, offline manifest, workflows, protected deploy configuration, dependency manifests, secrets/env files, pending data judgments and unrelated base repairs. No new feature, extra agent, pstack, model fallback, round-budget extension, label/hold change, commit, stage, push, PR mutation, merge, deployment or message to Craig.

Proposed updated PR description is job `PR_DESCRIPTION.md` for the host. No close verdict: the PR remains intended work with explicit publication/CI, Gate B and base-conflict prerequisites.
