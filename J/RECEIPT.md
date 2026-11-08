# PR #836 / #832 — data-only flight name cleanup (cursor-ubuntu)

Start HEAD: `9e2a002ccb4caa5ff581a27ac29d4fe45c328e36` (verified at launch).

## Data-only stored source edits

| Path | Change |
| --- | --- |
| `scripts/fixtures/nyc-vk-list-tab-rows.mjs` | Leading `Flight option: ` removed from **public `name` only** on list rows that materialize as output ids **651 / 652 / 658** (Delta / JetBlue / United at rows **646 / 647 / 653**). **ccabKey unchanged.** |
| `scripts/fixtures/vk-search-census/results/651.json` | `thingName` only → `Delta LAS-JFK 2026-06-23 07:05-15:13` |
| `scripts/fixtures/vk-search-census/results/652.json` | `thingName` only → `JetBlue LAS-JFK 2026-06-23 23:59-08:04+1` |
| `scripts/fixtures/vk-search-census/results/658.json` | `thingName` only → `United LAS-EWR 2026-06-23 07:00-15:00` |
| `scripts/fixtures/vk-search-census/structured-results.json` | Same three `thingName` fields; evidence/narrative bodies untouched |

`scripts/fixtures/pr336-vk-search-places.snapshot.json` titles for **651 / 652 / 658** were already clean (no edit).

## Runtime repair removal (9e2a002c family)

| Path | Change |
| --- | --- |
| `src/vacation/shared-trip-flight-stored-repair.mjs` | **Deleted** — banned stored-root `Flight option:` payload repair |
| `src/vacation/shared-trip-live-app-fields.mjs` | Removed `repairLegacyFlightOptionStoredFields` import and call from `applyLiveAppListRowFields` |
| `scripts/gateb_head_budget_lines.mjs` | Reverted 9e2a002c writeback / `applyLiveAppListRowFields` materialization (read + `syncSharedTripApiBudget` only) |
| `src/vacation/shared-trip-flight-merge.mjs` | `stripFlightOptionPrefix` no longer exported (ratchet; still used internally by `applyFlightThingFields`) |

## Tests updated

| Path | Why |
| --- | --- |
| `scripts/test_issue_832_day_timeline_binding.mjs` | Assert `buildNycCraigKimDaybydayTrip` + `finalizeServedSharedTripPayload` has zero `^Flight option:` on 651/652/658; warn if per-head Gate B JSON stale |
| `scripts/test_issue_832_daybyday_flight_placeholders.mjs` | Use clean stored names; no repair dependency |

## Local proof (`buildNycCraigKimDaybydayTrip` → `finalizeServedSharedTripPayload`)

| Id | Place name | Reservation title | Category | timeline |
| --- | --- | --- | --- | --- |
| 651 | `Delta LAS-JFK 2026-06-23 07:05-15:13` | same | Flight | false |
| 652 | `JetBlue LAS-JFK 2026-06-23 23:59-08:04+1` | same | Flight | false |
| 658 | `United LAS-EWR 2026-06-23 07:00-15:00` | same | Flight | false |
| 601 / 635 | no `^Flight option:` | — | assigned flights preserved |

Visible place + reservation `^Flight option:` count after served build: **0**.

## Gate B / live discrepancy (report only)

- Per-head fixture `/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/9e2a002ccb4caa5ff581a27ac29d4fe45c328e36.json` replay still shows **10** prefixed names (stale frozen JSON vs fresh fixture source); host must refresh head after publish.
- Live staging remains `10c78071` per HANDOFF — **no live staging PASS claimed** until host deploys this patch.

## Commands (all PASS unless noted)

| Command | Result |
| --- | --- |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS (warn: stale head fixture) |
| `node scripts/test_issue_832_daybyday_flight_placeholders.mjs` | PASS |
| `node scripts/test_issue_832_events_flight_classification.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_keepsake_style2.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Host publish

Uncommitted on `9e2a002c`. Host: review → commit → push PR #836 branch → refresh Gate B head fixture → verify live API token `8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y` post-deploy.
