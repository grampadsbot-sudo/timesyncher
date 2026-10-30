# #734 UI keep-PR 2 round 2 — lane receipt (HOST PUBLICATION ONLY)

**Start HEAD:** `7b196fd1cbab80e404a40d5e75616a4065cef6af` (unchanged; patch uncommitted).

**Outcome:** `source-ready` — round-2 rows H1, B3, B7, B8, B9; rebaked served bundle sha256 `7bb7397f4f33798df9cb23b0c65569bd130ed31e5d09184b4a39dee4ee48d6cd` on `public/assets/index-BKun7ofk.js` (6581024 bytes).

## Changes (uncommitted)

| Row | What |
| --- | --- |
| H1 | Hotel list `rr()` prefers `summary` before `itineraryNote` when `It(G)==="hotel"\|\|Zi(G)` so list rows show stored descriptions (22/22 target) |
| B3 | Readonly detail order after phone: website box, Summary readonly, Reviews readonly (`data-ts-detail-*`); viewer hides Summary/Details textareas (`Ce?…:null`); Story stays editable |
| B7 | Served bundle skips `stripTripView()` so Config → Trip View restores Flights/Hotels/Cars toggles |
| B8 | Restaurant/store tags: editors get `details[data-ts-tag-picker]` multi-select; viewers see selected chips only |
| B9 | Area chip label `En()` → `Sn("",G)` (neighborhood-only; no travel/subway copy in chip row) |

**Files:** `src/vacation/trek-ui-734-round2-patch.mjs` (new), `src/vacation/trek-ui-734-round1-patch.mjs` (re-export round2), `src/vacation/trek-style2-bundle.mjs`, `public/assets/index-BKun7ofk.js`, `scripts/test_ui_734_round2_punchlist.mjs` (new), `scripts/test_ui_734_round2_shared_slug_chrome.mjs` (new), `scripts/offline-tests.txt`.

Rebake: `node scripts/rebake_served_trek_bundle.mjs`.

## Per-row evidence

| Row | Command | Result |
| --- | --- | --- |
| H1,B3,B7,B8,B9 (bundle) | `node scripts/test_ui_734_round2_punchlist.mjs` | **PASS** @ rebake sha256 above |
| H1,B7,B9 (slug chrome 390+1280) | `node scripts/test_ui_734_round2_shared_slug_chrome.mjs` | **PASS** slug `8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y` — hotels 22/22 summaries ≥80%; Trip View Flights/Hotels/Cars after Config; no travel-time area chips |
| Round 1 no regress | `node scripts/test_ui_734_round1_punchlist.mjs` | **PASS** |
| #731 hotel itinerary note | `node scripts/test_hotel_itinerary_note_timeline_731.mjs` | **PASS** |

## Pre-DONE gates

| Gate | Result |
| --- | --- |
| `node scripts/test_offline_manifest.mjs` | **PASS** (375 offline / 17 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** (1003 lines `trek-style2-bundle.mjs`) |
| `node scripts/check-no-comments.mjs` | **BLOCKED** — missing `apps/vacation-client/node_modules/typescript` (host `npm ci` in vacation-client) |
| `node scripts/test_keepsake_style2.mjs` | **FAIL** — strict-equal assertion in existing keepsake harness (pre-existing vs round2; host rerun after full install) |

## Host publish

1. `npm ci` (root + `apps/vacation-client` if needed); rerun blocked pre-DONE checks.
2. Commit listed files; push; PR #734 tip Preview.
3. Staging: confirm hotels tab 22/22 descriptions at 390 and 1280 on slug `8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y`.

Not done: git commit/push (lane HOST PUBLICATION ONLY), CI green, merge.
