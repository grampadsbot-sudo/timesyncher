# VK fill #549 receipt (cursor-ubuntu hard round, 2026-10-21)

## Root cause

`6f1e1fe7` routed Gate B fixture replay through full `finalizeServedSharedTripPayload`, which reshaped minimal same-selection capture trips (`category` objects, hotel `externalId`, assignments) and failed `scripts/ops/dispatch/test_same_selection_capture.py`. Reverting replay to full finalize on `27037489` kept Blue Note website/prefix identity on **live** serve but left replay on the heavy path.

## Fix (local tip after commit)

- `shared-trip-fixture-replay.mjs`: scoped `enrichFixtureReplayServedTrip` — `bindPr336GateBCanonicalIdentity` plus `mergeStoredCcabNarrativeIntoOverride` only when `shouldMergeStoredCcabOnFixtureReplay` (Gate B row ids, website/alias binding, or timeline-selected non-hotel rows).
- `pr336-vk-search-trip-sources.mjs`: `shouldMergeStoredCcabOnFixtureReplay`; keeps `resolveStoredCcabKey` website/prefix identity from `27037489`.

Replay on `/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json`: place **5** Blue Note **127** words; place **49** Smoke **113** words.

## Checks

| Command | Exit |
| --- | --- |
| `python3 -m unittest scripts.ops.dispatch.test_same_selection_capture.ProducerAndCacheTests` | 0 |
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
