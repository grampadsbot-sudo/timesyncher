Closes #619

## Summary

- Restored merge-lost pr336 snapshot copy on ccab-backed Gate B timeline rows (`applyVkSearchSnapshotCopyFields` after `applyCcabRowSearchFields`), so row **602** summary binds to the checked-in snapshot again (`UWS specialty market; grab picnic supplies before a long day out.`).
- Replaced **Hotel Belleclaire Central Park** ccab semicolon fact sheet with judge-passing hotel prose so `buildPr336VkSearchPlacesByRowId` no longer clears row **603** `description` after #608 (`blank_description`).

## Checks (local)

- `node scripts/test_gate_b_product_row_fields.mjs` — 0
- `node scripts/test_vk_search_place_output_contract.mjs` — 0
- `node scripts/test_vk_hotel_detail_fill.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- PR #614 hotel-row ellipsis bundle assert (`data-ts-hotel-row-head`) — not present on `migrate/trek-source` served bundle; only the snapshot re-bind from `c504de62` applies here.
- Baselines, Gate B/capture config, `scripts/offline-tests.txt`, workflows, `pr336-vk-search-places.snapshot.json` (trip binding still overlays snapshot for copy rows 601–611).
