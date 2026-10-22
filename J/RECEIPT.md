# VK PR #599 / issue #595 — round 3 (price + budget binding)

**Start sha:** `a8fe9f33a211199c282c5517b29ed806aa0d8212`  
**Handoff:** GBrain `bot-admin/lanes/vk-pr-handoff/pr-599` — **page_not_found** (checked 2026-10-22).

## Problem (Gate B 2026-10-22 ~01:04 UTC on `a8fe9f33`, run `20261022-010418`)

Hotel descriptions 22/23 OK. Coverage FAIL (PR owns): hotels/flights showed prices on list tabs but Budget rows read `Add price` because `budgetModel` ignored `sourceRecord` prices; fixture replay skipped live list-row finalization and timeline flights never bound CCAB fares; Romer Hell's Kitchen missed CCAB lookup (ASCII vs curly apostrophe).

## Fix

- Align Budget + API budget amount parsing with list-tab `numericPrice` (`sourceRecord.price` / `totalPrice` / `nightlyRate`).
- Fixture replay: run `applyLiveAppListRowFields` after CCAB merge; gateb API slug runs `finalizeServedSharedTripPayload`.
- CCAB merge: resolve keys via `resolveNycCcabKey`; merge when travel rows lack bound price; always bind enriched fare onto flight/hotel/car overrides (timeline flights included).
- Live serve: estimated price fallback for flight/hotel/car when records lack a numeric price.

## Checks (local tip pending commit)

| Command | Result |
| --- | --- |
| `cd apps/vacation-client && npm test` | pass |
| `node scripts/test_hotel_ccab_narrative_fill.mjs` | pass |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |

Gate B Ubuntu structure re-run pending on pushed head (not self-certified).
