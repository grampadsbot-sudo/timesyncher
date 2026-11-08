# PR #836 / #832 r6 — cursor-ubuntu HOST PUBLICATION ONLY

Start HEAD: `ddfc8eabceb8d379feb07a34e9332648b34ab49b` (verified at launch).

## Root cause on `ddfc8eab`

Gate B run `20261108-135511` still served `Flight option:` in budget (and host per-head fixture counts 87 prefix hits across trip JSON). `repairLegacyFlightOptionStoredFields` already cleaned `places[]`, `reservations[]`, and assignment embeds, but **`budget[]` names were never repaired**, so budget tab and row-field binding still exposed stub prefixes after fixture replay (`places/reservations: 0` stub names; `budget: 10` before fix).

## This round (uncommitted)

| Path | Why |
| --- | --- |
| `src/vacation/shared-trip-flight-stored-repair.mjs` | Idempotent scrub of `budget[].name` / `title` for Flights rows (and any row whose name still starts with `Flight option: `). |
| `src/vacation/shared-trip-api-budget.mjs` | When syncing a budget line by `place_id`, rebind `line.name` to the repaired catalog place name. |
| `scripts/test_issue_832_day_timeline_binding.mjs` | Regression: budget stored root must strip authorized prefix. |

Prior head work (classification, `mr()` bind, day timeline `Ds(wn)`, snapshot 651/652/658) unchanged on `ddfc8eab`.

## Fixture replay proof (host head fixture, not Gate B self-cert)

Source: `/home/ubishere9995/tsv-dispatch/fixture-nyc/heads/ddfc8eabceb8d379feb07a34e9332648b34ab49b.json` → `prepareFixtureReplaySharedTrip`.

| Field set | `^Flight option:` on name/title (after repair) |
| --- | --- |
| `places[]` | 0 |
| `reservations[]` | 0 |
| `budget[]` | 0 (was 10) |

Sample budget: `Flight option: Delta LAS-JFK …` → `Delta LAS-JFK 2026-06-23 07:05-15:13` (place_id 651).

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

Uncommitted diff: 3 files above on top of `ddfc8eab`. Host: commit → push `vkfill/832-20261106152812` → Gate B on published head (`20261108-135511` class: budget + flights + daybyday + events). Cursor does not self-certify Gate B.
