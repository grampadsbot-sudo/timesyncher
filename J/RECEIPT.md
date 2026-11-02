# PR #765 / issue #595 — lane receipt (HOST PUBLICATION ONLY)

**Start HEAD:** `b72339d995779388626979ebbe7f23091d32ecb8` (verified before edit)

**Outcome:** `source-ready` — Gate B coverage price gap fixed in served TREK bundle; host must commit + push once.

## Root cause

Prior rounds added server-side travel price estimates (`thing-price.mjs`, `applyLiveAppListRowFields`, `listTabModel.numericPrice`) and pass unit tests, but **Gate B fixture-replay capture** still serves the NYC shared payload through the pinned replay producer (`1141d5ce…`) without `finalizeServedSharedTripPayload`. The live shared UI reads prices via upstream `bi(G) => ha(G).price ?? G.price`, so flights/hotels/cars with empty `price` rendered **Add price** / blank list fares. The flight row patch also returned a bare `"$"` (no digits), which fails `gateb_coverage.segment_has_price`.

## Fix

| File | Change |
| --- | --- |
| `src/vacation/trek-budget-target-patches.mjs` | `patchTravelPriceEstimateBi()` — category default estimates on `bi()` (flight 348, hotel `$250-$350/night`, car 72), aligned with `search-place-price-estimate.mjs` |
| `src/vacation/trek-live-product-patches.mjs` | Apply travel price patch in served bundle; flight fare fallback `$348` instead of `"$"` |
| `public/assets/index-BKun7ofk.js` | Rebaked via `renderServedTrekBundle()` so committed bundle matches patches |
| `scripts/test_shared_trip_served_live_tab_mount.mjs` | Assert bi travel estimate patch present; bare `$` fallback removed |

## Tests run (workspace @ b72339d + uncommitted patch)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_trip_served_live_tab_mount.mjs` | PASS |
| `node scripts/test_budget_required_price_completeness.mjs` | PASS |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | PASS |
| `node scripts/test_vk_hotel_detail_fill.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (after `npm ci` in `apps/vacation-client`) |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

**Host:** stage source/test files below only; commit, push once to `vkfill/595-20261031163009`, rerun pregate coverage on new head. CI green + coverage 0 unpriced travel rows = done gate.

## Uncommitted files (intended)

- `src/vacation/trek-budget-target-patches.mjs`
- `src/vacation/trek-live-product-patches.mjs`
- `public/assets/index-BKun7ofk.js`
- `scripts/test_shared_trip_served_live_tab_mount.mjs`
- `J/RECEIPT.md`

**Left alone:** baselines, Gate B scripts, `package.json` / lockfiles, check config.
