# VK PR #549 receipt (cursor-ubuntu, 2026-10-21)

## Outcome

Scoped ccab merge gating: fixture replay no longer enriches minimal trips on bare enrichment title match alone (fixes `test_same_selection_capture` Hotel Beacon), and flight-option ccab rows cannot bind to non-flight Things (restores flight options to Flights-only list behavior).

## Fix (local tip after commit)

`scripts/fixtures/pr336-vk-search-trip-sources.mjs`:

- `hasStoredCcabIdentity` + `storedCcabNarrativeNeedsMerge`: skip merge when the only ccab hit is exact display name with no trip-stored narrative identity.
- `ccabRecordMatchesPlaceCategory`: block flight-option / flight ccab on non-flight categories (and car/hotel mismatches).
- Applied in `mergeStoredCcabNarrativeIntoOverride` and `shouldMergeStoredCcabOnFixtureReplay`.

## Checks

| Command | Exit |
| --- | --- |
| `python3 scripts/ops/dispatch/test_same_selection_capture.py` | 0 |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | 0 |
| `node apps/vacation-client/test/listRows.unit.mjs` | 0 |
| `cd apps/vacation-client && npm run typecheck` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

Tip sha: _(filled after commit)_.
