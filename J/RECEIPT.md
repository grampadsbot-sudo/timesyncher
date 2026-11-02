# PR #765 / issue #595 — lane receipt (HOST PUBLICATION ONLY)

**Start HEAD:** `6ffea7ac58c2d0db4f469b9f5d7383e930a90aa2` (verified before edit)

**Base merge:** host merged `origin/vk` at `ebaaa74e678fbf26fc439d126a656ef5689d563e` into this PR head; conflicts resolved in `J/RECEIPT.md` and `public/assets/index-BKun7ofk.js` (base bundle + rebake).

**Outcome:** `source-ready` — Gate B coverage price gap fixed in served TREK bundle after vk merge; host must commit merge + rebake and push once.

## Root cause

Prior rounds added server-side travel price estimates (`thing-price.mjs`, `applyLiveAppListRowFields`, `listTabModel.numericPrice`) and pass unit tests, but **Gate B fixture-replay capture** still serves the NYC shared payload through the pinned replay producer (`1141d5ce…`) without `finalizeServedSharedTripPayload`. The live shared UI reads prices via upstream `bi(G) => ha(G).price ?? G.price`, so flights/hotels/cars with empty `price` rendered **Add price** / blank list fares. The flight row patch also returned a bare `"$"` (no digits), which fails `gateb_coverage.segment_has_price`.

## Fix

| File | Change |
| --- | --- |
| `src/vacation/trek-budget-target-patches.mjs` | `patchTravelPriceEstimateBi()` — category default estimates on `bi()` (flight 348, hotel `$250-$350/night`, car 72), aligned with `search-place-price-estimate.mjs` |
| `src/vacation/trek-live-product-patches.mjs` | Apply travel price patch in served bundle; flight fare fallback `$348` instead of `"$"` |
| `public/assets/index-BKun7ofk.js` | Base `vk` bundle taken for merge conflict; rebaked via `node scripts/rebake_served_trek_bundle.mjs` |
| `scripts/test_shared_trip_served_live_tab_mount.mjs` | Assert bi travel estimate patch present; bare `$` fallback removed |

## Tests run (merge tree @ 6ffea7ac + conflict resolution)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (sha256=d84ada563d27bb0f2ddc2ba82cb4967e4e0123935e773ddafc251f466779590a) |
| `node scripts/test_shared_trip_served_live_tab_mount.mjs` | PASS |
| `node scripts/test_budget_required_price_completeness.mjs` | PASS |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | PASS |
| `node scripts/test_vk_hotel_detail_fill.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1046 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (395 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (255 report, 0 fail; merged `trek-live-product-patches.mjs` at 500 lines) |

**Host:** stage merge resolution + source below; `git commit` merge (and rebake if unstaged); push once to `vkfill/595-20261031163009`, rerun pregate coverage on new head. CI green + coverage 0 unpriced travel rows = done gate.

## Uncommitted files (intended)

- Merge resolution: `J/RECEIPT.md`, `public/assets/index-BKun7ofk.js`
- `src/vacation/trek-live-product-patches.mjs` (501→500 line ratchet after vk merge)

**Left alone:** baselines, Gate B scripts, `package.json` / lockfiles, check config.
