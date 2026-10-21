# VK fill #549 receipt (cursor-ubuntu hard round 4, 2026-10-21)

## Root cause

Gate B capture replay (`prepareFixtureReplaySharedTrip`) skipped `mergeStoredCcabNarrativeIntoOverride` for **Smoke Jazz & Supper Club** when the trek title already matched the ccab key, `timeline` was false, and no website was on the row (raw capture showed **3 words**: `Start: 9:00 PM`). Live `finalizeServedSharedTripPayload` always merged (109 words). Prior prefix-length fix (1141d5ce) only helped short titles like **Smoke**; full-title replay rows still failed `shouldMergeStoredCcabOnFixtureReplay` (harness #576 raw-vs-replay parity).

## Fix (local tip after commit)

- `pr336-vk-search-trip-sources.mjs`: merge when stored ccab resolves and list narrative is missing, under 30 words, or `isGenericDescription`; same rule in `shouldMergeStoredCcabOnFixtureReplay` so fixture replay matches live serve.
- `test_stored_ccab_canonical_identity.mjs`: regression for full-title Smoke replay without website.

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
