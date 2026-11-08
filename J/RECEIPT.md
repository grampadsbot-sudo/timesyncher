# PR #836 / #832 r7 — cursor-ubuntu HOST PUBLICATION ONLY

Start HEAD: `0036ff62df380b424be093114dcc4302698444b7` (verified at launch; host published budget repair from r6 on this tip).

## What was already on tip

Commit `0036ff62` (parent `ddfc8eab`) landed the r6 budget stored-root fix:

| Path | Change |
| --- | --- |
| `src/vacation/shared-trip-flight-stored-repair.mjs` | Scrub `budget[].name` / `title` for Flights rows |
| `src/vacation/shared-trip-api-budget.mjs` | Rebind `line.name` to catalog place name when syncing by `place_id` |
| `scripts/test_issue_832_day_timeline_binding.mjs` | Budget repair unit assertion |

## This round (uncommitted)

| Path | Why |
| --- | --- |
| `scripts/test_issue_832_day_timeline_binding.mjs` | Regression: `prepareSharedTripForLiveApp` end-to-end budget rebind; optional host per-head fixture replay stub count |

## Fixture replay proof (per-head Gate B source, not self-cert)

Source: `/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/0036ff62df380b424be093114dcc4302698444b7.json` → `prepareFixtureReplaySharedTrip` / `prepareSharedTripForLiveApp` / `finalizeServedSharedTripPayload`.

| Check | Result |
| --- | --- |
| `places[]` / `reservations[]` / `budget[]` `^Flight option:` on name/title after replay | 0 |
| `placesForCategoryTab(..., 'events')` flight stubs | 0 |
| `buildDayTimeline` day 1 flight-opt rows | 0 |
| Raw head fixture JSON on disk (pre-replay) | 57 `Flight option:` hits (expected; repair runs on serve/replay, not host JSON file) |

Sample: budget `Flight option: Delta LAS-JFK …` → `Delta LAS-JFK 2026-06-23 07:05-15:13` (place_id 651).

## Gate B note (host authority)

Gate B run `20261108-143413` on head `0036ff62` still **FAIL** (pixel vs base `10c7807`). Cursor does not override. `capture-regions.json` under `/home/ubishere9995/tsv-dispatch/gateb-cand/pr836-0036ff6/` still lists 10 `Flight option:` flight rows on `flights-390.png` / `flights-1280.png` while replayed served payload has 0 stub names — mismatch between capture DOM and `prepareFixtureReplaySharedTrip` output; host should confirm capture inject uses replay payload bytes. Events tab body text in that run no longer lists `Flight option:` rows.

## Commands / results

| Command | Result |
| --- | --- |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_issue_832_daybyday_flight_placeholders.mjs` | PASS |
| `node scripts/test_issue_832_events_flight_classification.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_keepsake_style2.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Host publish

Uncommitted: `scripts/test_issue_832_day_timeline_binding.mjs`, `J/RECEIPT.md` on top of `0036ff62`. Host: review → commit → push `vkfill/832-20261106152812` → fresh Gate B on published head.
