# TSV issue #608 (cursor-ubuntu vkfill-608)

**Start sha:** `fb95a6306b16ea71cfc1adc6fc76a5779ec47403`  
**Branch:** `vkfill/608-20261022042745` → `migrate/trek-source`

## Problem

Staging NYC shared trip is served from `buildNycCraigKimDaybydayTrip()`; 22 hotels had ccab/semicolon copy that `enrichSearchPlace` strips, so `descriptionPassesDetailJudge` failed (0–3/22) despite prices largely present.

## Fix

- Prose hotel descriptions + short summaries + `summarySourceUrls` in `nyc_ccab_place_enrichment.json` (22 hotels).
- Motto overlay description aligned in `pr336-gate-b-ccab-overlay.json`.
- Regenerated `pr336-vk-search-places.snapshot.json`.
- `test_vk_hotel_detail_fill.mjs` expects fixture prose to pass without web enrichment.

## Checks (local, commit tip)

| Command | Result |
| --- | --- |
| Fixture judge script (22 hotels) | 22/22 `descriptionPassesDetailJudge`; 0 missing hotel/flight/car prices |
| `node scripts/test_gate_b_product_row_fields.mjs` | exit 0 |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | exit 0 |
| `node scripts/test_vk_hotel_detail_fill.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | exit 0 |

## Verdict

Ready for host publish + PR (`Closes #608`). Staging `live_accept.py` `hotel_desc` / `item_count` not run from this lane (no deploy).
