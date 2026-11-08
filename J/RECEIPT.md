# PR #836 / #832 r5 — cursor-ubuntu HOST PUBLICATION ONLY

Start HEAD: `d2200cfcc774f7ae9afd455519780ca669a79273` (verified at launch).

## Root cause (r5, on head)

Gate B `events-*` failed because legacy flight duplicates lived in stored trip data as `Transport` / `websiteCapture.category: flight` with `Flight option: …` names. `It(G)/bn(G)` treated override `transport` as non-flight, so `Cc` (Events) listed them. r4 `mr()` binding and snapshot cleanup were correct but insufficient without classification + stored repair.

## Changes on `d2200cfc` (already committed on head)

| Area | File(s) | What |
| --- | --- | --- |
| Stored repair (idempotent) | `src/vacation/shared-trip-flight-stored-repair.mjs`, hook in `applyLiveAppListRowFields` | Strip authorized `Flight option: ` prefix on places, reservations, assignment embeds; clear `Documented NYC option (flight)` descriptions; set `override.category=flight`. Runs on every `prepareSharedTripForLiveApp` / fixture replay via `finalizeServedSharedTripPayload` → live GET path. |
| List tab classification | `apps/vacation-client/src/lib/listTabModel.mjs`, `intake-transport-kind.mjs`, `keepsake-product-overrides.mjs` | `tabCategoryKey` uses `productThingCategory`; `websiteCapture.category=flight` counts as flight. |
| Served bundle | `public/assets/index-BKun7ofk.js`, `trek-thing-detail-fields-patch.mjs`, `trek-live-product-flight-day-patches.mjs` | `Fn()` checks `websiteCapture.category`; `bn=G=>It(G)==="flight"\|\|Fn(G)==="flight"`. `mr()` place-name bind; day timeline `Ds(wn)`; snapshot rows 651/652/658 clean. |
| Tests | `scripts/test_issue_832_events_flight_classification.mjs`, `scripts/offline-tests.txt` | Events must not list transport-flight duplicates; bundle `bn\|\|Fn` guard. |

## This round (uncommitted)

| Path | Why |
| --- | --- |
| `scripts/test_keepsake_style2.mjs` | CI `unit-tests` failed: assertion still expected legacy comma-operator `Ds()` after #832 `DS_PATCH` gained `place_id` timeline fallback (`d2200cfc` `trek-style2-bundle.mjs`). Asserts new `Ds=G=>{var Re,on,tsPid;…` prefix instead. |

Carry patch `832-r5-carry.patch` did not apply on `d2200cfc` (superseded by head); no re-apply.

## Staging repair path

On each shared-trip serve: `finalizeServedSharedTripPayload` → `prepareSharedTripForLiveApp` → `applyLiveAppListRowFields` → `repairLegacyFlightOptionStoredFields` (in-memory on payload returned to client; idempotent). No host fixture edits.

## Render proof (fixture replay, not Gate B self-cert)

Fixture: `prepareFixtureReplaySharedTrip` on repo snapshot + pr336 fixture (host head fixture built by dispatcher when Gate B runs).

| Tab | legacy transport-flight duplicates (e.g. id 17) | Stub chrome |
| --- | --- | --- |
| Events | **0 rows** | none |
| Flights | listed under Flights | stored name = visible name after repair |

Sample stored names after repair (snapshot rows):

| id | name |
| --- | --- |
| 651 | Delta LAS-JFK 2026-06-23 07:05-15:13 |
| 652 | JetBlue LAS-JFK 2026-06-23 23:59-08:04+1 |
| 658 | United LAS-EWR 2026-06-23 07:00-15:00 |

## Commands / results

| Command | Result |
| --- | --- |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_issue_832_daybyday_flight_placeholders.mjs` | PASS |
| `node scripts/test_issue_832_events_flight_classification.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_keepsake_style2.mjs` | PASS (after assertion fix) |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Host publish

Uncommitted diff: `scripts/test_keepsake_style2.mjs` only (on top of `d2200cfc`). Host: commit → push `vkfill/832-20261106152812` → CI + Gate B `events-*` + `flights-390` + `daybyday-*` on published head (not self-certified here).
