# PR #844 — cursor-ubuntu hard round tier 1 (check 1)

Start HEAD: `30c5a7d9e2d46f9fad6444c3afee6c77e0ebd590` (verified at launch).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-844`: **page_not_found** (noted per brief).

## Root cause (CI `scripts/test_vk_hotel_detail_fill.mjs`)

`buildGateBSearchPlaceForRow` always preferred `NYC_GATE_B_ROW_CCAB_KEYS[id]` over the row’s own `ccabKey`. Timeline row **616** is Whole Foods Market Columbus Circle, but staging list-tab row **616** is Hotel Edison with `ccabKey: Hotel Edison`. That bound Whole Foods prose (25 words, fails detail judge) and triggered `searchPlaceNeedsWebDetailEnrichment === true`.

Earlier Gate B rounds (eb295143, cc3ead70) fixed events/cars UI patches; offline `test_nyc_screen_verify_chrome.mjs` passes on this tree. The CI regression on head `30c5a7d9` was the ccab id-reuse collision, not missing budget prices in fixture finalization (local `test_nyc_budget_search_fill_prices.mjs` PASS).

## Fix

| Path | Change |
| --- | --- |
| `scripts/fixtures/pr336-vk-search-trip-sources.mjs` | Add `resolveGateBRowCcabKey`: when row `ccabKey` matches display `name`, use that ccab (list-tab hotels/stores); else keep timeline map for alias rows (e.g. 611 Blue Note). Wire into `buildGateBSearchPlaceForRow` and `assertGateBRowProvenance`. |

## Local proof (base `30c5a7d9` + uncommitted patch)

| Command | Result |
| --- | --- |
| `node scripts/test_vk_hotel_detail_fill.mjs` | **PASS** (was: line 20 enrichment assertion) |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_pr336_ccab_search_provenance.mjs` | PASS |
| `node scripts/probe_pr336_stored_narrative_lineage.mjs` | PASS |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | PASS |
| `node scripts/test_nyc_screen_verify_chrome.mjs` | PASS |
| `node scripts/test_car_brand_filter_scope.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Gate B (chief dr — host re-capture required)

Prior failures: events/cars structure + budget DOM prices on published heads. This patch fixes the CI blocker; host must publish → CI on new head → Gate B `staging-structure-v6` on that head.

## Host publish

Uncommitted patch on `fix/nyc-screen-t3018-3020` at base `30c5a7d9`. Host: review → commit → push once → CI → Gate B on new head sha (record here after push).
