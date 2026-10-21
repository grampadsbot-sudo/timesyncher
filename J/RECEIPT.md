# VK fill #549 receipt (cursor-ubuntu, 2026-10-21)

## Root cause

Gate B Hotels tab rows bound stored ccab with **planning-note** copy (`Neighborhood:…; Rating:…; Status: candidate`) as the list **summary** hook. Only **Motto** had a sourced overlay (`websiteFlavour` + `reviewThemes` in `pr336-gate-b-vk-reviews.json`). Other hotels merged ccab but kept the template summary, so list descriptions failed Craig’s 80% hotel substance bar (issue #546 comment 6319245106).

## Fix

- `trip-thing-enrichment.mjs`: `isHotelPlanningNote`, `hotelStoredCcabListNarrative` — build substantive hotel list copy from ccab neighborhood/ratings/price (same stored path as search enrich).
- `pr336-vk-search-trip-sources.mjs`: treat planning-note hotel copy as needing merge; apply hotel narrative on merge; copy `thirdPartySource` and `neighborhood`.
- `test_stored_ccab_canonical_identity.mjs`: regress top Gate B hotel names + Motto overlay preservation.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | 0 |
| `node scripts/test_list_row_description_substance.mjs` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `apps/vacation-client` `node test/listRows.unit.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Not self-certified

Ubuntu Gate B structure mode on pushed PR head (`bot-admin/lanes/vk-pr-handoff/pr-549`).
