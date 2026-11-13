# TSV #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `9b5462ce7796f79c85dde578663cbcfcadb136b3` (verified before edit)  
**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971`

## Root cause (unit-tests on `9b5462ce`)

**CI `unit-tests` (per `~/tsv-dispatch/state.json` pr_gate 971):** red on `9b5462ce` — offline slice fails at `scripts/test_issue_959_flight_row_detail_price.mjs`.

**Product:** #969 v3 detail patch (`src/vacation/trek-thing-detail-v3-patch.mjs`) injects `tsPriceEditor=Ce&&Sa?…` into the served rating-row IIFE. The #959 flight/price harness evals that IIFE without binding `Ce`/`Sa`/`bi`/`Xa` → `ReferenceError: Ce is not defined`. Bundle syntax fix on `9b5462ce` (drop stray `]` on `REVIEW_V3_EDIT_EXTRAS`) is already on tip; this is the remaining red test.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `scripts/test_issue_959_flight_row_detail_price.mjs` | Pass `Ce`, `Sa`, `bi`, `Xa` into the extracted rating-row IIFE (view mode `Ce=false`, `Sa=false`), matching `scripts/test_issue_964_detail_overall_rating_row.mjs`. |

## Local verification (starting HEAD `9b5462ce`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_issue_959_flight_row_detail_price.mjs` | pass |
| `node scripts/test_issue_959_owner_pencil_webkit.mjs` | pass (#969 acceptance) |
| `node scripts/test_issue_951_thing_detail_pencil_price.mjs` | pass |
| `node scripts/test_issue_964_detail_overall_rating_row.mjs` | pass |
| `node scripts/test_issue_836_budget_flights_chrome.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| offline slice from `scripts/test_issue_959_flight_row_detail_price.mjs` through manifest end | pass |
| `apps/vacation-client` typecheck/lint/test | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |

## Host next steps

Commit the one test path above on `vkfill/969-20261112114227` → push → wait for unit-tests + accept + gateb on new tip. No git operations performed in lane.
