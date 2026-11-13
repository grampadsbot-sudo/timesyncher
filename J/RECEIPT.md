# TSV #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `763c04b466fa3aca3252bc2f2ab0e0af8344a40c` (verified before edit)  
**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971`

## Root cause (unit-tests on `763c04b4`)

**CI job `unit-tests` check-run `132068830867`:** fails at step **Offline unit tests** — first red test `scripts/test_issue_836_budget_flights_chrome.mjs` (app never boots; `waitForFunction` timeout on `Day-by-Day`).

**Product:** `REVIEW_V3_EDIT_EXTRAS` in `src/vacation/trek-thing-detail-v3-patch.mjs` ended with an extra `]`, producing invalid served JS at bundle line ~12365 (`esbuild`: *Expected identifier but found "("*). `renderServedTrekBundle()` / committed `public/assets/index-BKun7ofk.js` on this head were therefore unloadable in the browser; offline chrome gates fail before later tests run.

**Accept check:** live-accept on staging stays keyed to deploy sha `2cbd2b1077d0f7017a5210a805bc1d47508dc9b7` (`~/tsv-dispatch/live-accept/result.json`); not a source defect on this patch. Expect accept after host publish + staging deploy of the new tip.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | Drop stray trailing `]` on `REVIEW_V3_EDIT_EXTRAS` so baked v3 edit-mode review rows splice valid JS. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256=`151a3213d41e46d860e1e5ead658c22be4ec63d13440d7b70fa3ceba9c741e4a`). |

## Local verification (starting HEAD `763c04b4`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | pass |
| esbuild transform on rebaked bundle | pass (no syntax error) |
| `CHROME_PATH=… node scripts/test_issue_836_budget_flights_chrome.mjs` | pass |
| offline slice `offline-tests.txt` lines 16–25 | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `apps/vacation-client` typecheck/lint/test | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/check-harness-protected-offline.mjs` | pass |

## Host next steps

Single commit on `vkfill/969-20261112114227` with the two paths above → push → wait for unit-tests + accept + gateb on new tip. No git operations performed in lane.
