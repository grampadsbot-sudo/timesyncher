# #832 product repair — cursor-ubuntu HOST PUBLICATION ONLY

- **Starting HEAD:** `6f8313719af3fd75ba8304af067d6cbf384060b3` (PR #836 / `vkfill/832-20261106152812`)
- **Status:** uncommitted source ready for host commit/publish (no git mutations this round)

## Root cause (Gate B day-by-day / flights chrome)

Served Day-by-Day used `tsItinLine(item, assignmentNotes)` with an `ITINERARY_LINE_BUNDLE` that fell back to assignment notes / `override.notes` when `itineraryNote` was absent. That violated the #832 field-binding contract (visible itinerary line = exact stored `itineraryNote` or absent) and could surface pipeline stub text on rows while server-side `itineraryLineText()` tests passed.

## Changes

| Path | Why |
|------|-----|
| `src/vacation/itinerary-line.mjs` | `ITINERARY_LINE_BUNDLE` no longer falls back to assignment/override notes; matches `itineraryLineText()`. |
| `apps/vacation-client/src/lib/dayTimelineModel.mjs` | `itineraryNoteFor` binds only stored `itineraryNote` (via `itineraryLineText`). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `renderServedTrekBundle` so live UI picks up bundle patch. |
| `scripts/test_itinerary_fresh_daybyday_bundle.mjs` | Expect no notes fallback in bundle reader. |
| `scripts/test_issue_832_day_timeline_binding.mjs` | Assert missing `itineraryNote` stays absent. |

Prior head `6f831371` already had portable #832 tests and flight merge without description backfill from `summary`/`longDetails`.

## Tests (local, starting HEAD `6f831371`)

| Command | Result |
|---------|--------|
| `node scripts/test_issue_832_daybyday_flight_placeholders.mjs` | PASS |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | FAIL (env: missing `typescript` for `comment-tools.mjs`) — not weakened |

NYC fixture replay (`buildNycCraigKimDaybydayTrip()` + `buildDayTimeline`): 0 Flight option / Documented binding issues.

## Uncommitted product paths

`apps/vacation-client/src/lib/dayTimelineModel.mjs`, `public/assets/index-BKun7ofk.js`, `scripts/test_issue_832_day_timeline_binding.mjs`, `scripts/test_itinerary_fresh_daybyday_bundle.mjs`, `src/vacation/itinerary-line.mjs`

## Host next

- Commit/push once; wait for CI on new head; Gate B on published head (not self-certified here).
- Staging `/api/version` must match merge SHA before live claims (`bot-admin/messages/time-syncher/decisions-log` protocol).
