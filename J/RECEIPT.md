# VK fill #980 — unit-tests CI fix (cursor-ubuntu, composer-2.5)

Outcome: **source-ready** for host publication from starting HEAD `1ee412662c052a78229baf3bc13e478a5eecff45`. Issue #980 / PR #985.

## CI root cause (unit-tests red on `1ee41266`)

| Failure | Fix |
| --- | --- |
| `scripts/test_thing_travel_total_price.mjs` read absolute Ubuntu-only path `tsv-dispatch/acceptance/fixtures/demo-nyc-99-snapshot-20261110/shared-trip.json` → ENOENT on GitHub `unit-tests` | Vendored slim repo fixture `scripts/fixtures/demo-nyc-99-hotel-car-total-price-20261110.json`; test loads via `import.meta.url` |
| `apps/vacation-client/test/budget.unit.mjs` expected pre-#980 hotel amounts (1556 / 700) | Updated to hotel **est. total** math (×1.20): 1867, 840; `nightly` now `null` for hotel/car via `thingBudgetAmount` |

## Changed files (uncommitted; host must commit + push)

| File | Change |
| --- | --- |
| `scripts/fixtures/demo-nyc-99-hotel-car-total-price-20261110.json` | New slim NYC-99 snapshot slice (hotel/car total-price assertions) |
| `scripts/test_thing_travel_total_price.mjs` | Repo-local fixture path |
| `apps/vacation-client/test/budget.unit.mjs` | #980 hotel budget expectations |

Prior #980 product edits remain on HEAD `1ee41266` (unchanged this round).

## Local checks (starting HEAD `1ee412662c052a78229baf3bc13e478a5eecff45`)

| Command | Result |
| --- | --- |
| `node scripts/test_thing_travel_total_price.mjs` | exit 0 |
| `node scripts/test_acceptance_980_hotel_car_totals.mjs` | exit 0 |
| `node scripts/test_728_budget_data.mjs` | exit 0 |
| `node scripts/test_shared_tab_list_summary.mjs` | exit 0 |
| `cd apps/vacation-client && npm run typecheck` | exit 0 |
| `cd apps/vacation-client && npm run lint` | exit 0 |
| `cd apps/vacation-client && npm run test` | exit 0 |

No commit, stage, push, merge, rebase, or deploy (HOST PUBLICATION ONLY).
