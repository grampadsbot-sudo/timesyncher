# PR #907 / #903 — stored-data title binding (head `e6a44caf`)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `e6a44caf72a92a83009709ac1d07ea9d5e6ab11d` (verified).

## Root cause

Serve-time `#903` rewrites in `live-qa-903-presentation.mjs` (`retitleFlightUpsell`, jargon sanitizer, id-keyed trip overrides) made canonical builder output disagree with Gate B snapshot / live replay. CI red: `scripts/test_shared_tab_list_summary.mjs` expected Express Deal title after serve rewrite while PR225 stored `Priceline opaque Toyota Corolla`.

## Fix

| area | change |
| --- | --- |
| `live-qa-903-presentation.mjs` | Remove serve-time title/narrative rewrites; keep ratings/hours/time backfill only |
| `nyc-craig-kim-daybyday-rows.mjs` | Stored `rentalCompany`, flight `arrivalTime`, row 634 upgrade title/category |
| `nyc-craig-kim-daybyday-trip.mjs` | Drop `SOUTHWEST_LGA_ARRIVAL_BY_ROW` + id 609 override; read row fields |
| `pr336-vk-search-trip-sources.mjs` | Row 609 `rentalCompany` on ccab record; **kept** `GATE_B_DISPLAY_TITLE_ALIASES[609]` (provenance requires ccab/display split) |
| Fixtures/tests | Regenerated `pr336-vk-search-places.snapshot.json`; PR225 + trip99 replay + positive v1 stored wording; binding tests without jargon helper |

## TARGET E (all snapshot rows)

Command: `node -e` binding loop (`buildNycCraigKimDaybydayTrip` vs `pr336-vk-search-places.snapshot.json` titles). **Result: all 94 rows match** (start HEAD `e6a44caf`).

## Checks (this round)

| check | result |
| --- | --- |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/regenerate_pr336_search_trip_fixture.mjs` | PASS (94 places) |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `scripts/offline-tests.txt` full run | **FAIL** `scripts/test_live_transcript_dialog_pdf.mjs:651` (`gbrain-cli-get_page` vs `bundled-get_page`; env, not PR diff) |

## Host publish

Uncommitted product paths (no `evidence/` — reverted after vacation-client test):

- `src/vacation/live-qa-903-presentation.mjs`
- `scripts/fixtures/nyc-craig-kim-daybyday-rows.mjs`
- `scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs`
- `scripts/fixtures/nyc-craig-kim-daybyday-positive-v1.mjs`
- `scripts/fixtures/nyc-pr225-shared-trip.mjs`
- `scripts/fixtures/nyc-screen-trip99-live-shared-api.json`
- `scripts/fixtures/pr336-vk-search-trip-sources.mjs`
- `scripts/fixtures/pr336-vk-search-places.snapshot.json`
- `scripts/test_gate_b_product_row_fields.mjs`
- `scripts/test_issue_903_live_qa_polish.mjs`
- `J/RECEIPT.md`, `J/PR_DESCRIPTION.md`
