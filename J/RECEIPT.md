# PR #836 / #832 — cursor-ubuntu HOST PUBLICATION ONLY

- **Starting HEAD:** `3e71cab36cf04cca362ca0851a8b885957161979`
- **Status:** uncommitted source ready for host commit/publish

## Root cause (Gate B `20261108-034919` daybyday / flights chrome)

Gate B capture uses `prepareFixtureReplaySharedTrip` → `applyLiveAppListRowFields` on `/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json`. `applyFlightThingFields` already stripped `Flight option:` from `places[]` and `thingOverrides` (e.g. place 13 → `Delta LAS-JFK …`), but **day assignment rows still embedded stale `place` snapshots** with the old `Flight option:` names. `resolvePlace` merged `{ ...catalog, ...row.place }`, so embedded names **overwrote** the cleaned catalog — visible Day-by-Day and list titles showed the stub prefix after the field-binding change removed display-time `mr()` stripping.

Evidence (starting HEAD, before fix): `prepareFixtureReplaySharedTrip(host fixture)` left **10** assignment embeds matching `/^Flight option:/i` (e.g. day 1 embed id 17 `Flight option: Southwest LAS-LGA…`).

## Fix

| Path | Why |
|------|-----|
| `src/vacation/shared-trip-live-app-fields.mjs` | After list-row normalization, `syncAssignmentPlaceSnapshots()` rewrites embedded assignment `place` rows from the canonical `places[]` catalog (name/title + `place_id`). |
| `apps/vacation-client/src/lib/dayTimelineModel.mjs` | `resolvePlace` binds catalog `name`/`title` when both catalog and embed exist (defense in depth for served payload). |
| `scripts/test_issue_832_day_timeline_binding.mjs` | Host-fixture replay assert: 0 stub embeds; optional `resolvePlace` binding check when host path present. |

No display-time `Flight option:` strip in the bundle; no fixture hard-coding; existing `stripFlightOptionTitlePrefix` in `applyFlightThingFields` unchanged.

## Render proof (local, head + uncommitted fix)

| Path | Result |
|------|--------|
| `prepareFixtureReplaySharedTrip(/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json)` | **0** assignment embeds with `Flight option:` (was 10) |
| `buildDayTimeline(served, day 1)` on replay payload | No row title contains `Flight option` |
| Serve path: `scripts/fixtures/gate-b-nyc-shared-staging.json` → `applyLiveAppListRowFields` | Flight names stripped (650–653 → airline route titles) |

## Tests

| Command | Result |
|---------|--------|
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_issue_832_daybyday_flight_placeholders.mjs` | PASS |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | FAIL (env: missing `apps/vacation-client/node_modules/typescript`) — unchanged harness gap |

## Uncommitted product paths

`apps/vacation-client/src/lib/dayTimelineModel.mjs`, `src/vacation/shared-trip-live-app-fields.mjs`, `scripts/test_issue_832_day_timeline_binding.mjs`, `J/RECEIPT.md`

## Host next

Commit/push on `vkfill/832-20261106152812`; wait for CI; re-run Gate B on published head (not self-certified here).
