# VK fill #549 receipt (cursor-ubuntu hard round, 2026-10-21)

## Outcome

Gate B capture fixture `nyc-shared.json` place **5** (`Blue Note`) stayed at **Start: 8:00 PM** (~3 words) because `resolveStoredCcabKey` only matched full enrichment titles; the alias row has no `externalId` and is not `Blue Note Jazz Club`. Day-by-day row **611** ccab map pointed at Blue Note while the pr336 snapshot identity is **Jazz at Lincoln Center**.

## Fix (local tip after commit)

- `resolveStoredCcabKey`: website-host match against stored ccab enrichment URLs, then unique multi-word / length≥8 name-prefix match (e.g. `Blue Note` → `Blue Note Jazz Club`); persist `externalId` / `ccabKey` on merge.
- `NYC_GATE_B_ROW_CCAB_KEYS[611]`: `Jazz at Lincoln Center` (aligns with `pr336-vk-search-places.snapshot.json` row 611).
- `scripts/test_stored_ccab_canonical_identity.mjs`: alias-row + 611 identity assertions.

Replay on `/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json`: place 5 description **123** words; place 49 Smoke **109** words (unchanged).

## Checks

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
