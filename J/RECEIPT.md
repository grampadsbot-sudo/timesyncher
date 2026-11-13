# VK fill #980 — Hotels/Cars list total price (cursor-ubuntu, composer-2.5)

Outcome: **source-ready** for host publication from starting HEAD `2cbd2b1077d0f7017a5210a805bc1d47508dc9b7`. Authority: `bot-admin/decisions/vk-hotels-cars-list-total-price-20261113`. Closes #980 when host publishes + CI green.

## Summary

Hotels and Cars list rows, Thing detail **Price**, and Budget tab now show **stay totals** (`$N est. total` when estimated from nightly/rental rate × trip days/nights × 1.20; `$N total` when a real stored total exists). Removed `/ night` and per-day suffixes on Hotels/Cars lists.

## Changed files (uncommitted)

| File | Change |
| --- | --- |
| `src/vacation/thing-travel-total-price.mjs` | Core total/estimate math + served-bundle helpers `tsThingTravelTotalAmount` / `tsThingTravelTotalLabel` |
| `src/vacation/trek-vk-980-total-price-patch.mjs` | Patches `ie()`, list price, budget `zt`, budget row label, detail Price, editor `priceIsTotal` |
| `src/vacation/thing-price.mjs` | Hotel/car `thingBudgetAmount` uses travel-total logic |
| `src/vacation/shared-trip-api-budget.mjs` | Promotes `stayTotal` on overrides for non-estimate hotel/car rows |
| `src/vacation/list-row-dates.mjs` | Travel-list header price uses total label helper |
| `src/vacation/trek-style2-bundle.mjs` | Applies `patchVk980TotalPrice` in `renderServedTrekBundle` |
| `scripts/test_thing_travel_total_price.mjs` | Fixture checks on `demo-nyc-99-snapshot-20261110` |
| `scripts/test_acceptance_980_hotel_car_totals.mjs` | Acceptance wrapper (unit_script per `tsv-dispatch/acceptance/980.json`) |
| `scripts/test_728_budget_data.mjs` | Hotel estimate expects 1.20 markup |
| `scripts/test_shared_tab_list_summary.mjs` | Patched bundle + total-price harness |
| `scripts/offline-tests.txt` | Registers new tests |

**Host still required:** rebake `public/assets/index-BKun7ofk.js` via `renderServedTrekBundle` (committed bundle must match patched serve path).

## Local checks (starting HEAD `2cbd2b1077d0f7017a5210a805bc1d47508dc9b7`)

| Command | Result |
| --- | --- |
| `node scripts/test_thing_travel_total_price.mjs` | exit 0 — Park Central `$1,210 est. total`; Belleclaire `$3,626 total`; car totals unchanged |
| `node scripts/test_acceptance_980_hotel_car_totals.mjs` | exit 0 |
| `node scripts/test_728_budget_data.mjs` | exit 0 |
| `node scripts/test_shared_tab_list_summary.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |

No commit, stage, push, merge, rebase, or deploy (HOST PUBLICATION ONLY).
