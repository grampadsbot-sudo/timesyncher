Closes #584

## Summary

Flights list rows on the served TREK shared-trip UI now show a substantive description (≥6 words) derived from long stored ccab summaries. The bundle `rr()` helper had been returning an empty string for summaries over 20 words, so Gate B only saw the fare grid text (`JetBlue$2527:22 am3:31 p`) and failed `generic descriptions` on `flights-1280` / `flights-390`.

## Changes

- `src/vacation/flight-list-row-summary.mjs` — shared `pickFlightListRowSummaryText` + minified picker injected into `rr()`
- `src/vacation/trek-thing-detail-fields-patch.mjs` — replace broken list-row `rr` patch with clause-based picker; re-patch already-baked bundles
- `apps/vacation-client/src/lib/listTabModel.mjs` — use shared module (same behavior as #571 vacation-client path)
- `apps/vacation-client/test/listRows.unit.mjs` — JetBlue fixture summary + bundle picker parity

## Test plan

- [x] `node apps/vacation-client/test/listRows.unit.mjs`
- [x] `node scripts/check-no-comments.mjs`
- [x] `node scripts/test_offline_manifest.mjs`
- [x] `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`

## Left alone (scope)

- Gate B row-layout (#547) and timeline baseline (#558) gaps on base `2b6d8df0`
- Capture scripts, baselines, `scripts/offline-tests.txt`, workflows
