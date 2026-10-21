# VK fill #549 receipt (cursor-ubuntu hard round 3, 2026-10-21)

## Root cause

Gate B `restore_check.py` failed Smoke with **under 6 words** in captured row `desc` when list text was only `Start: 9:00 PM`. `enrichmentHitByUniqueNamePrefix` refused titles shorter than 8 characters with no space, so trek rows titled **Smoke** never resolved `Smoke Jazz & Supper Club` stored ccab narrative on fixture replay (even when `place.description` was the generic `Documented NYC option (music)` template).

## Fix (local tip after commit)

- `pr336-vk-search-trip-sources.mjs`: allow unique single-match prefix binding for short display titles (e.g. `Smoke` → `Smoke Jazz & Supper Club`); on merge, replace thin generic `place.description` with stored narrative bytes.
- `test_stored_ccab_canonical_identity.mjs`: regression for short Smoke title, fixture replay row summary ≥30 words, and `resolveStoredCcabKey({ name: 'Smoke' })`.

## Checks

| Command | Exit |
| --- | --- |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | 0 |
| `node scripts/test_list_row_description_substance.mjs` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `python3 -m unittest scripts.ops.dispatch.test_same_selection_capture.ProducerAndCacheTests` | 0 |
| `apps/vacation-client` `node test/listRows.unit.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Not self-certified

Ubuntu Gate B structure mode on pushed PR head (`bot-admin/lanes/vk-pr-handoff/pr-549`).
