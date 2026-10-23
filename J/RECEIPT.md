# PR #653 / issue #641 — cursor-ubuntu vkfill-653 handback

Actual starting HEAD: `43dcbeae2afcf39fe95c4c17709be9f82496778f` (verified before edits).

## Root cause

`applyLiveAppListRowFields` called `estimateSearchPlacePrice` for flight/hotel/car rows with no sourced price. That wrote heuristic prices onto `thingOverrides` before `syncSharedTripApiBudget`, so:

- `node scripts/test_shared_trip_api_budget_lines.mjs` failed at line 95 (`gateAllowed.has(0)`): unpriced gate hotels were budgeted as ~$250/night instead of `$0` / Add price.
- Budget BUD scrape amounts could disagree with API `budget[]` for the same scenario.

NYC Gate B travel rows already get prices from VK snapshot / `priceFromRecords`; they do not depend on this heuristic pass (`test_nyc_budget_search_fill_prices.mjs`, `test_nyc_gateb_snapshot_staging_list_prices.mjs`).

## Patch (uncommitted — host publication)

| File | Change |
| --- | --- |
| `src/vacation/shared-trip-live-app-fields.mjs` | Drop live-app `estimateSearchPlacePrice` fallback; keep sourced prices via `priceFromRecords` only. |

## Local verification (`43dcbeae` + above diff)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | pass |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | pass |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |

Not run: CI, Ubuntu Gate B `gateb_coverage` on new head, Keepsake QA, live #641 acceptance, Vercel preview (cap).

## Host publication

Uncommitted files:

- `src/vacation/shared-trip-live-app-fields.mjs`

Host: commit on `vkfill/641-20261022210748`, push once, re-run CI + pre-merge Gate B on published head.
