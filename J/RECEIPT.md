# TSV #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `b5a103153af602b00a4111e21e0aa8f4897845c4` (verified before edit)  
**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971`

## Root cause (unit-tests on `b5a10315`)

**CI `scripts/test_gate_b_product_row_fields.mjs`:** `patchThingDetailV3` (#969) bakes `detailBodyV3` with single-quoted `data-ts-detail-info-box` / `data-ts-detail-reviews` needles and dropped the edit-mode `[1,2,3,4].filter(G=>Ps(Dt,G)…)` block from v3 `extras`. `patchLiveProductDetailBundle()` still static-scans the committed `public/assets/index-BKun7ofk.js` for the pre-v3 minified double-quote needles. Earlier rounds only updated unrelated tests; the v3 ↔ live-detail patch contract stayed broken.

## Root cause (Gate B price failures on `81aeed22` — not fixed in product this round)

`~/tsv-dispatch/fixture-nyc/nyc-shared.json` + `finalizeServedSharedTripPayload()` show prices on travel rows (e.g. Delta LAS-JFK `257`, Arthouse Hotel `508`; 0 missing after finalize). Offline `node scripts/test_nyc_budget_search_fill_prices.mjs` passes. Named Gate B “have no price” lines are therefore unlikely to be a data/finalize regression on this head; host should re-run `staging-structure-v6` capture after publish and compare capture body vs fixture if prices still fail (harness timing or #969 layout baseline separate from this CI fix).

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-thing-detail-patches.mjs` | After detail patches, normalize baked v3 `data-ts-detail-*` needles to Gate B minified double-quote form. |
| `src/vacation/trek-thing-detail-readonly-patch.mjs` | Treat v3 single-quote `address-hours` as already patched (skip readonly fieldset splice). |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | Keep edit-mode review rows (`Ps(Dt,G)` filter/map) inside v3 `extras` fieldset. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `renderServedTrekBundle()` from upstream pin in `scripts/test_served_trek_bundle.mjs`. |

## Local verification (starting HEAD `b5a10315`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | **pass** (was CI fail on `b5a10315`) |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | pass |

## Host next steps

Single commit on `vkfill/969-20261112114227` with the four paths above → push → wait for unit-tests + accept + gateb on new tip. No git operations performed in lane.
