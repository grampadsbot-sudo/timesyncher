# VK issue #588 receipt (cursor-ubuntu vkfill-588)

**Branch:** `vkfill/588-20261021125728`  
**Base:** `migrate/trek-source` (start `7bc66068`)  
**Gap ref:** GBrain `bot-admin/lanes/vk-known-gaps-218a3b39` (generic logos)

## Change

Gate B fixture replay served seven list rows with the same fallback chip because NYC shared fixture rows kept broken or generic `logoUrl` values and replay did not merge stored ccab enrichment before `applyLiveAppListRowFields`.

- Added `src/vacation/shared-trip-fixture-replay.mjs` (`prepareFixtureReplaySharedTrip`) to normalize timeline selections, bind PR336/ccab identity, merge stored ccab narrative and **always** apply ccab `logoUrl` when present, then run live-app list row finalization.
- Extended `scripts/fixtures/pr336-vk-search-trip-sources.mjs` with stored-ccab helpers used on fixture replay (logo bind overwrites stale fixture URLs).
- Added `Boat tour candidates` to `scripts/fixtures/nyc_ccab_place_enrichment.json` (Circle Line favicon); corrected Hyatt House Chelsea favicon to Hyatt HDS asset.
- `apps/vacation-client/src/lib/listTabModel.mjs`: `logoUrlForPlace` falls back to `resolveThingLogoUrl` when no explicit URL.
- `scripts/ops/capture/timeline-replay.mjs`: in-process `prepareFixtureReplaySharedTrip` after binding checks (replaces subprocess driver).
- Minor: `nyc-craig-kim-daybyday-trip.mjs` row 635 AA logo; `test_gate_b_product_row_fields.mjs` ccab count 64.

## Local verification

| Command | Result |
| --- | --- |
| `node` replay on `~/tsv-dispatch/fixture-nyc/nyc-shared.json` | Boat/Chelsea/United/Hyatt rows distinct favicon URLs; no logo URL repeated 7+ times |
| `node scripts/test_pr336_ccab_search_provenance.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/test_trip_thing_logo_metadata.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass |

`node scripts/test_capture_fixture_replay_harness.mjs` needs a healthy `capture-producer` git worktree on this host (worktree registration error); not run to completion here.

## Not done in-agent (host / CI)

- PR push, CI green on PR head, Gate B structure check PASS on events/hotels 1280/390 (required for Done means).

## Verdict

Logo source + fixture replay enrichment implemented locally; pre-DONE gates pass on tip sha below; host publishes branch and runs CI + Gate B.
