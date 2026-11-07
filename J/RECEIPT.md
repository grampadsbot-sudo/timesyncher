# #832 product repair — cursor-ubuntu HOST PUBLICATION ONLY

- **Starting HEAD:** `26aeb1ef2f4c305ec0904e2912caee5a7e25df97` (PR base `vk` = `10c78071`)
- **Branch:** `vkfill/832-20261106152812` / PR #836 (issue #832 in keep set)
- **Status:** uncommitted source ready for host commit/publish (no git mutations this round)

## Stub chrome / field binding (Gate B targets)

- Restored flight live-app pipeline: `applyFlightThingFields` + `mergeFlightThingOverrideAfterCcab` so stored `itineraryNote` binds on overrides, `Flight option:` titles strip, and `Documented … option` stub text is stripped from list `summary`/`longDetails` without touching real notes (`src/vacation/shared-trip-live-app-fields.mjs`, `shared-trip-flight-merge.mjs`).
- Added `src/vacation/thing-title-normalize.mjs`; `itinerary-line.mjs` + rebaked `ITINERARY_LINE_BUNDLE` reject pipeline-documented stubs as itinerary lines while preserving real `itineraryNote` text.
- Day-by-day: `isPickedTimelineFlight` in `dayTimelineModel.mjs` keeps ground-travel gaps correct when `timeline:false` flights sit between places; timeline-only flights still require explicit `timeline` pick.
- Rebaked `public/assets/index-BKun7ofk.js` from upstream via `renderServedTrekBundle` (matches `scripts/test_served_trek_bundle.mjs`).

## Tests (local, starting HEAD `26aeb1ef`)

| Test | Result |
|------|--------|
| `scripts/test_issue_832_daybyday_flight_placeholders.mjs` | PASS |
| `scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `scripts/test_served_trek_bundle.mjs` | PASS |
| `scripts/test_check_code_ratchet.mjs` | PASS (after wiring `stripFlightOptionTitlePrefix`) |
| `scripts/run-offline-tests.mjs` | **FAIL** at `scripts/test_live_transcript_dialog_pdf.mjs:651` (`gbrain-cli-get_page` vs `bundled-get_page`) — unrelated to #832 diff; not weakened |

CI reference (original red): GitHub job `128222870248` / run `42314244586` Offline unit tests (log download 401; local repro prefix in `/tmp/832-original-unit.log` truncated before failure line).

## Uncommitted product paths

`apps/vacation-client/src/lib/dayTimelineModel.mjs`, `public/assets/index-BKun7ofk.js`, `scripts/offline-tests.txt`, `scripts/test_issue_832_day_timeline_binding.mjs`, `src/vacation/itinerary-line.mjs`, `src/vacation/shared-trip-flight-merge.mjs`, `src/vacation/shared-trip-live-app-fields.mjs`, `src/vacation/thing-title-normalize.mjs`

## Remaining blockers

- Host publish + Preview; `/api/version` must equal merge SHA before any live claim.
- Gate B NYC shared screens (not self-certified here).
- Full offline suite: fix or exclude-env `test_live_transcript_dialog_pdf.mjs` on host CI.
- Vacation-client `npm test` shell layout hit preview timeout (`data-trip-view-root`) this round — re-run with `serve-preview.sh` on host if needed.
