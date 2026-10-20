# VK fill #549 receipt (cursor-ubuntu, 2026-10-20)

## Outcome

Bound **Blue Note Jazz Club** and **Smoke Jazz & Supper Club** list-row descriptions to the same stored ccab → `enrichSearchPlace` path used for other Gate B event rows (#573 `pr336-vk-search-trip-sources.mjs`), so `composeListRowDescription` receives 30+ word `longDetails` on live trips that only had start time + price.

Local tip: `52237d9c` (parent `7dd5ef04`).

## What changed

- `scripts/fixtures/nyc_ccab_place_enrichment.json`: ccab records for Blue Note Jazz Club and Smoke Jazz & Supper Club (venue sites/addresses already used elsewhere in VK ccab corpus).
- `scripts/fixtures/pr336-gate-b-ccab-overlay.json`: Gate B–style stored narratives (ratings, where, why-go themes) matching other event overlay rows.
- `scripts/fixtures/pr336-vk-search-trip-sources.mjs`: `mergeStoredCcabNarrativeIntoOverride` / title lookup helpers.
- `src/vacation/shared-trip-live-app-fields.mjs`: merge stored ccab narrative when list-row `longDetails` are thin; copy `longDetails` on experience rows.
- `scripts/test_gate_b_product_row_fields.mjs`: ccab place count 63 → 65.

## Checks (local, tip `52237d9c`)

```text
node scripts/test_list_row_description_substance.mjs  # passed
node scripts/test_gate_b_product_row_fields.mjs         # passed
apps/vacation-client: node test/listRows.unit.mjs      # passed
node scripts/check-no-comments.mjs                      # passed
node scripts/test_offline_manifest.mjs                  # passed
BASE=migrate/trek-source node scripts/check-code-ratchet.mjs  # passed
```

Thin-row simulation: Blue Note / Smoke Jazz `rowSummary` word counts 129 / 113 after `applyLiveAppListRowFields`.

## Not done here

- `git merge origin/migrate/trek-source`: shell policy blocked merge/fetch write ops in this lane; branch tip remains off base until host rebases/merges. Flight-summary compose path from #572 on `7dd5ef04` kept.
- Gate B description share ≥80% and CI green on pushed PR head: requires host publish + Ubuntu Gate B rerun (not self-certified).

## Left alone

Fixtures/baselines/Gate B capture config, snapshot `611` Jazz at Lincoln Center row, passing judged rows per handoff.
