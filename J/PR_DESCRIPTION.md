Closes #608

## Summary

- Documented the #608 enrichment tip sha (`f07da90b`) on `J/RECEIPT.md` (PR #612 scope).
- Fixed CI `unit-tests`: after #608, `enrichSearchPlace` cleared every hotel `description` that failed the 30-word judge, including Brave rows that should keep category-built copy. Only ccab semicolon fact sheets (`Neighborhood:`) stay blank until Tavily web detail; other hotels and non-hotels fall back to `buildCategoryDescription` again. Matched `enrichTripThing` hotel handling.

## Checks (local)

- `node scripts/test_trip_thing_logo_metadata.mjs` — 0
- `node scripts/test_vk_hotel_detail_fill.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-612` — page not found (noted in `J/RECEIPT.md`).
- Baselines, Gate B/capture scripts, `scripts/offline-tests.txt`, workflows, fixtures beyond enrichment behavior.
- Prior CI failure on head `c91b77c2`: GitHub Actions run `39704818179`, job `unit-tests` / `Offline unit tests` (`test_trip_thing_logo_metadata.mjs` hotel description assertion).
