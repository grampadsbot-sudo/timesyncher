# Issue #582 — uncommitted changes for host review

Result: blocked on rendered verification, starting HEAD `f7be729670c183c4f04802040a170a38ba0e5aec`; this is not an issue-completion or Gate B verdict.

Base: `migrate/trek-source`; actual starting HEAD and `origin/migrate/trek-source` both `f7be729670c183c4f04802040a170a38ba0e5aec`. Git metadata was not modified. Publication, commit, push and ONE draft PR belong to the outer host. Draft body is in `PR_DESCRIPTION.md` in the job directory and includes `Closes #582`.

Model: gpt-6.1-sol. No extra agents, alternate model calls, OpenRouter, paid fallback, pstack, deployment, CI trigger or CI rerun.

## Scope and changes

The supplied base already contains the main #582 implementation in `3d02b24480cb92aaca8c8d0aa389a42981d92c97`: list tabs are excluded; assignments and `dayIds` provide budget inventory; timeline totals use day placement; an unscheduled saved-place test exists; `scripts/lib/positive-fixture-render-contract-lib.mjs:383` already compares rendered `[data-ts-budget-row]` count with distinct assignment IDs at 390 and 1280.

This round fixes the remaining enforcement gap. `apps/vacation-client/src/lib/budgetModel.mjs` now computes assignment IDs once in `budgetCompletenessChecks` and requires assignment membership for every `row_on_timeline_<id>`. A `dayIds` placement can still supply a budget row as allowed by the issue, but no longer masks a missing assignment in completeness verification. No rendered markup, styles, row-selection behavior or pricing logic changed in this round.

Extended the already registered `scripts/test_budget_timeline_only_rows.mjs` to cover: unscheduled saved prices excluded from trip/bucket/timeline totals; an unscheduled `timeline: true` flag excluded; an assigned `timeline: false` item retained; repeated assignments billed once; and a `dayIds`-only row producing the required failed assignment check. No new test file or manifest change. Feature Map reference: `features/budget.md` via `features/README.md`; no new visible behavior claim.

## Verification

All results below apply to the uncommitted source diff against `f7be729670c183c4f04802040a170a38ba0e5aec`; they are local results, not CI.

| Command | Result | Reference |
| --- | --- | --- |
| `node scripts/test_budget_timeline_only_rows.mjs` before source fix | Exit 1: expected failed `row_on_timeline_31`, received no failed checks | `f7be729670c183c4f04802040a170a38ba0e5aec`, `regression-before.log` |
| `node scripts/test_budget_timeline_only_rows.mjs` after source fix | Exit 0 | `f7be729670c183c4f04802040a170a38ba0e5aec` |
| `node apps/vacation-client/test/budget.unit.mjs` | Exit 0 | `f7be729670c183c4f04802040a170a38ba0e5aec` |
| `node scripts/test_budget_required_price_completeness.mjs` | Exit 0 | `f7be729670c183c4f04802040a170a38ba0e5aec` |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | Exit 0 | `f7be729670c183c4f04802040a170a38ba0e5aec` |
| `npm run test:keepsake-style2` | Exit 0 | `f7be729670c183c4f04802040a170a38ba0e5aec`, `keepsake-tests.log` |
| Client `npm run build` and `npm run typecheck` | Both exit 0 | `f7be729670c183c4f04802040a170a38ba0e5aec` |
| `TIMESYNCHER_BUILD_SHA=f7be729670c183c4f04802040a170a38ba0e5aec npm run build` | Exit 0 | `f7be729670c183c4f04802040a170a38ba0e5aec`, `root-build.log` |
| `node scripts/check-no-comments.mjs` | Exit 0: 865 files scanned | `f7be729670c183c4f04802040a170a38ba0e5aec`, `no-comments.log` |
| `node scripts/test_offline_manifest.mjs` | Exit 0: 295 offline / 17 online | `f7be729670c183c4f04802040a170a38ba0e5aec`, `offline-manifest.log` |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | Exit 0: 255 report / 0 fail | `f7be729670c183c4f04802040a170a38ba0e5aec`, `code-ratchet.log` |
| `git diff --check` | Exit 0 | `f7be729670c183c4f04802040a170a38ba0e5aec` |

The first plain root build exited 1 because its required SHA environment variable was unset (`timesyncher build SHA is missing: ""`). The subsequent documented `TIMESYNCHER_BUILD_SHA` invocation succeeded without changing build configuration. Existing lockfile dependencies were installed with `npm ci`; package manifests and lockfiles were not changed.

## Exact blocker and access route

Blocked rendered verification reference: `f7be729670c183c4f04802040a170a38ba0e5aec`; GBrain `skills/tsv-qa-visual-gate/skill` and repo `scripts/verify-positive-fixture-render-contract.mjs:59`.

Command:

```text
CHROME_PATH=/home/ubishere9995/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node scripts/verify-positive-fixture-render-contract.mjs --artifact-dir=/home/ubishere9995/tsv-work/vkfill-582-20261025102806-job/render-contract
```

Exit 2, first error: `positive payload bytes/sha256 mismatch`.

- Expected bytes: `711352`; SHA256: `98119a045d6b3053816cc5b97bc183fb2b33c605bc0f7878740d52116c75b9c8`.
- Actual bytes: `881234`; SHA256: `a359766c68731bbf0db304cef4d333fae7fbaaf82f04d78855e7200248b2d41b`.
- Evidence: `/home/ubishere9995/tsv-work/vkfill-582-20261025102806-job/render-contract.log`.

The harness stopped before browser captures, so no screenshot/pixel grade or rendered row-count result is claimed. The pinned harness and fixture are outside this coder round's scope. No fixture, snapshot, reference, baseline, capture script, Gate B script, threshold, allowlist, workflow, deployment configuration, dependency manifest or secret/env file was changed. No test/check was weakened. No source write failed.

Access route checked before reporting this blocker: tool discovery found no callable `user-gbrain` tool; the installed `gbrain` CLI successfully read `skills/tsv-qa-visual-gate/skill`, `skills/tsv-engineer-pr-process/skill`, `skills/timesyncher-vacation-verification/skill`, `skills/keepsake-qa/skill`, `skills/vk-thing-data-contract/skill`, the required September SoTs, decisions log and UI spec. Read results are retained in the job directory under slug-derived names. GBrain access succeeded; the blocker is the repo harness fingerprint mismatch, not an access or credentials claim. The QA skill requires missing/stale verification inputs to fail closed and routes fixture/data faults to their owner.

Host next step: review the uncommitted source patch, publish ONE draft PR into `migrate/trek-source` with the prepared body, and obtain the normal CI and Ubuntu Gate B results on the published head. The fixture/harness owner must resolve the fingerprint mismatch before the rendered check can verify row counts. CI run ID and Gate B run ID: not available because no PR was published by this worker. Full issue acceptance is unverified.
