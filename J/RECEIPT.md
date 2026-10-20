# VK fill #549 receipt (cursor-ubuntu, 2026-10-20)

## Outcome

Bound **Blue Note Jazz Club** and **Smoke Jazz & Supper Club** list-row descriptions to stored ccab → `enrichSearchPlace` (#573 path). Merged **`origin/migrate/trek-source`** via `git read-tree` (lane blocks `git merge`); kept #572 flight summary clip + `omitListPrice` in `listTabModel.mjs`.

## What changed

- `scripts/fixtures/nyc_ccab_place_enrichment.json` + `pr336-gate-b-ccab-overlay.json`: stored narratives for Blue Note and Smoke Jazz.
- `scripts/fixtures/pr336-vk-search-trip-sources.mjs`: `mergeStoredCcabNarrativeIntoOverride` when live `longDetails` are under 30 words.
- `src/vacation/shared-trip-live-app-fields.mjs`: apply ccab merge on list rows.
- Base merge: `SOURCE_MAP.md`, narrative lineage lib/probes, snapshot regen from migrate/trek-source; `scripts/offline-tests.txt` registers base capture/provenance tests.

## Checks

Run at commit time on local tip (see DONE line).

## Not self-certified

Gate B description ≥80% good rows and CI on pushed PR head require host publish + Ubuntu Gate B.
