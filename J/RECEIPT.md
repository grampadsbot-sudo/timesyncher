# PR #836 / #832 r5 — cursor-ubuntu HOST PUBLICATION ONLY

Start HEAD: `00244ce574b9755b298e385c393bb8316518cdf7` (verified at launch).

## Root cause (r5)

Gate B `events-*` failed because legacy flight duplicates lived in stored trip data as `Transport` / `websiteCapture.category: flight` with `Flight option: …` names. `It(G)/bn(G)` treated override `transport` as non-flight, so `Cc` (Events) listed them. r4 `mr()` binding and snapshot cleanup were correct but insufficient without classification + stored repair.

## Changes

| Area | File(s) | What |
| --- | --- | --- |
| Stored repair (idempotent) | `src/vacation/shared-trip-flight-stored-repair.mjs`, hook in `applyLiveAppListRowFields` | Strip authorized `Flight option: ` prefix on places, reservations, assignment embeds; clear `Documented NYC option (flight)` descriptions; set `override.category=flight`. Runs on every `prepareSharedTripForLiveApp` / fixture replay via `finalizeServedSharedTripPayload` → live GET path. |
| List tab classification | `apps/vacation-client/src/lib/listTabModel.mjs`, `intake-transport-kind.mjs`, `keepsake-product-overrides.mjs` | `tabCategoryKey` uses `productThingCategory`; `websiteCapture.category=flight` counts as flight. |
| Served bundle | `public/assets/index-BKun7ofk.js`, `trek-thing-detail-fields-patch.mjs` | `Fn()` checks `websiteCapture.category`; `bn=G=>It(G)==="flight"\|\|Fn(G)==="flight"`. r4 carry patch retained (`mr()` place-name bind, day timeline `Ds(wn)`, snapshot rows 651/652/658). |
| Refactor (ratchet) | `shared-trip-flight-merge.mjs`, `shared-trip-live-app-fields.mjs` | Moved `syncAssignmentPlaceSnapshots` to flight-merge module (FILE-SIZE-500). |
| Tests | `scripts/test_issue_832_events_flight_classification.mjs`, `scripts/offline-tests.txt` | Events must not list transport-flight duplicates; bundle `bn\|\|Fn` guard. |

## Staging repair path

On each shared-trip serve: `finalizeServedSharedTripPayload` → `prepareSharedTripForLiveApp` → `applyLiveAppListRowFields` → `repairLegacyFlightOptionStoredFields` (in-memory on payload returned to client; idempotent). No host fixture edits.

## Render proof (fixture replay, not Gate B self-cert)

Fixture: `/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/00244ce574b9755b298e385c393bb8316518cdf7.json` → `prepareFixtureReplaySharedTrip`.

| Tab | ids 13–22 (legacy duplicates) | Stub chrome |
| --- | --- | --- |
| Events | **0 rows** (were 10) | none |
| Flights | 13,15,17–21,651,652,658,… | stored name = visible name; no `Flight option` / `Documented` |

Sample binding (stored name → served list name):

| id | stored name after repair |
| --- | --- |
| 651 | Delta LAS-JFK 2026-06-23 07:05-15:13 |
| 652 | JetBlue LAS-JFK 2026-06-23 23:59-08:04+1 |
| 658 | United LAS-EWR 2026-06-23 07:00-15:00 |
| 17 | Southwest LAS-LGA 2026-06-23 05:05-15:45 |

## Commands / results

| Command | Result |
| --- | --- |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_issue_832_daybyday_flight_placeholders.mjs` | PASS |
| `node scripts/test_issue_832_events_flight_classification.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (no new fails) |

## Host publish

Uncommitted product diff on worktree at `00244ce574b9755b298e385c393bb8316518cdf7`. Host: commit → push `vkfill/832-20261106152812` → Gate B `events-*` + `flights-390` + `daybyday-*` on published head (not self-certified here).
