# PR 653 vkfill-653 round — trip center without HC-COORD (host publish)

Start HEAD `17aecaa8e28ad4fdcce20995f02fd75babdd7f29` (verified). Handoff `bot-admin/lanes/vk-pr-handoff/pr-653` 2026-10-23 5:45 AM PT (HC-COORD on `147d91d9`; prior review/Zabar's work already on branch).

## Change this round

`src/vacation/thing-evidence-dossier-execution.mjs`: Brave/xAI trip center no longer uses a NYC literal in `src/` (already true on `17aecaa8`). Added `resolveBatchTripCenter` + `tripCenterForTarget` so center comes from (in order) per-target `center`, trip `metadata.destinationCenter` / trip location fields (`destinationCoordsFromTrip`), or the mean of saved Thing coordinates in the batch (fixture CCAB lat/lng). Reuses `trip-map-initial-view.mjs` coord helpers — no new hardcoded coords.

`scripts/test_thing_evidence_dossier.mjs`: unit regressions for explicit center, trip metadata, and batch centroid fallback.

Prior commits on branch (`147d91d9`..`17aecaa8`): review-aggregator keep, Tavily trustpilot/opentable topics, Zabar's supported-only description repair, `PR336_NYC_TRIP_CENTER` on fixture targets only.

## Uncommitted files (host commit + push once)

```
src/vacation/thing-evidence-dossier-execution.mjs
scripts/test_thing_evidence_dossier.mjs
```

## Checks run (workspace @ `17aecaa8` + above diff)

| Check | Result |
| --- | --- |
| `node scripts/test_thing_evidence_dossier.mjs` | PASS |
| `node scripts/test_dossier_round5.mjs` | PASS |
| `node scripts/check-hardcoded-content.mjs` | PASS (0 fail) |
| `node scripts/test_check_hardcoded_content.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (291 offline) |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/run-offline-tests.mjs` | FAIL at `test_day_by_day_map_marker_bounds_chrome.mjs` — no Chrome at `/usr/bin/google-chrome-stable` (lane env; not introduced by this diff) |

Not claimed: CI green, Gate B 32/32, run10 acceptance DESC/REV 10/10, merge.

## Left alone (per handoff / managing dr)

- Gate B named failures on flight/hotel list prices and hotel description quality scores on `17aecaa8` — issue **#659**, not #641/#653. No capture, fixture-replay, check, or Flights/Hotels UI edits.
- Deploy, run10 acceptance, push — host publisher only.
