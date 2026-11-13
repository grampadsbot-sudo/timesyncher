# Issue #988 — delete Summary→Details fill fallbacks (cursor-ubuntu, composer-2.5)

Outcome: **source-ready** for host publication from starting HEAD `2cbd2b1077d0f7017a5210a805bc1d47508dc9b7`. HOST PUBLICATION ONLY — no commit/push in lane.

Authority: Craig 2026-11-13 11:37 AM PT (pt3372u); GBrain `eggbot-essence-ladder-prompt-20261028` / decisions-log #68.

## Source changes (uncommitted)

| File | Change |
| --- | --- |
| `src/vacation/search-place-detail-enrichment.mjs` | `mergeWebDetailIntoSearchPlace`: drop `detail.summary` fallback into `longDetails`. |
| `src/vacation/place-detail-enrichment.mjs` | `applyEnrichedDetailToTripThing`: `description` from `detail.longDetails` only (not `detail.summary`). |
| `src/vacation/trip-thing-enrich-row.mjs` | Stop writing `sourceRecord.summary` from the same text as `description`. |
| `src/vacation/shared-trip-live-app-fields.mjs` | Hotel merge: stop replacing generic `summary` with `hotelNarrative`; remove unused `isHotelPlanningNote` import. |
| `scripts/test_acceptance_988_no_summary_details_fallback.mjs` | New acceptance unit script (issue #988). |
| `scripts/offline-tests.txt` | Register new offline test. |

## Checks (local, starting HEAD `2cbd2b1077d0`)

| Command | Result |
| --- | --- |
| `node scripts/test_acceptance_988_no_summary_details_fallback.mjs` | exit 0 |
| `node scripts/test_vk_hotel_detail_fill.mjs` | exit 0 |
| `node scripts/test_trip_thing_logo_metadata.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 (459 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 1 — missing `apps/vacation-client/node_modules/typescript` (full monorepo install not run in lane) |

NYC Gate B positive-v1 contract payload SHA256 unchanged by patch: `aa75c85a36c72ede939ef32359f1bae69cff5cc1c7c3fc15c552877c4d786a98` at start HEAD and after edits (brief cites `1083d980…` for a different snapshot label; contract hash on `buildNycCraigKimDaybydayTripPositiveV1()` is `aa75c85a…` on `2cbd2b1077d0`).

## Host next steps

Commit all paths above on branch `vkfill/988-20261113114255`, push once, open PR into `vk` with `Closes #988`, wait for CI (unit-tests, secrets, accept, gateb).
