Closes #588

## Summary

Fixes the migrate/trek-source **generic logos** known gap (`bot-admin/lanes/vk-known-gaps-218a3b39`): Gate B fixture replay now merges stored NYC ccab `logoUrl` values (and live-app list row resolution) so Boat tour candidates, Chelsea Market, United flight option, Hyatt House Chelsea, and related rows no longer share one placeholder chip on Events/Hotels.

## What changed

- New `prepareFixtureReplaySharedTrip` in `src/vacation/shared-trip-fixture-replay.mjs` for capture replay.
- Stored-ccab merge/bind helpers in `scripts/fixtures/pr336-vk-search-trip-sources.mjs` (ccab logo wins over stale fixture URLs).
- `nyc_ccab_place_enrichment.json`: Boat tour candidates (Circle Line); Hyatt House favicon path.
- `listTabModel.mjs`: `resolveThingLogoUrl` fallback for list chips.

## Checks run locally

- `node scripts/test_pr336_ccab_search_provenance.mjs`
- `node scripts/test_gate_b_product_row_fields.mjs`
- `node scripts/test_trip_thing_logo_metadata.mjs`
- `node scripts/check-no-comments.mjs`
- `node scripts/test_offline_manifest.mjs`
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`

Fixture replay spot-check: `prepareFixtureReplaySharedTrip` on `nyc-shared.json` — no single `logoUrl` on 7+ rows; Boat/Chelsea/United/Hyatt show operator favicons.

## Left alone (scope)

Layout, timeline, baselines, Gate B checker thresholds, workflows, dependencies.
