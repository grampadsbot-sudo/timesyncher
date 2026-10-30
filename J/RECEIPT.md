# PR #731 lane vkfill-731 — source-ready (HOST PUBLICATION ONLY)

**Starting HEAD:** `51c7e320b3d6e6f35e5df2bd26b6984266be87b2` (unchanged; no commit/push in this lane).

**Authorization:** Chief dr brief 2026-10-30 08:35 PT (Craig t2836u) — TARGET 1 hotel itinerary notes on check-in only; TARGET 2 conditional.

## TARGET 1 — hotel itineraryNote only on check-in

Day-by-Day and Style one/two print timeline `itineraryNote` via `tsItinLine()` only when the row type is not in the skip set. Added **`hotel-sleep`** alongside existing `hotel-wake` and `hotel-checkout` skips (live `ROW_TYPE_SKIP` in `trek-live-product-patches.mjs`; print `OP_TITLE_PATCH` / `SU_TITLE_PATCH` in `trek-style2-bundle.mjs`). Check-in rows use type **`hotel-event`** and remain eligible for the note.

Rebaked `public/assets/index-BKun7ofk.js` via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `8ab937c211f48689bfc875df31aee09dfe17c35f4a28c692a4aac05099918cde`).

## TARGET 2 — Belleclaire budget place_id 603 → 26

**Skipped.** NYC seed on this branch (`scripts/fixtures/gate-b-nyc-shared-staging.json`) uses catalog/timeline **place_id 603** for Hotel Belleclaire; no assignment **id 26** exists in that fixture. Rewriting budget membership without a same-id timeline binding would be name-matching or a #728 data change — out of this UI lane scope. Host harness / DATA #728 still owns U1 same-id binding per dr eggbot 2026-10-29 18:30 PT.

## Local checks (starting HEAD + uncommitted PATCH)

| Command | Result |
| --- | --- |
| `node scripts/test_hotel_itinerary_note_timeline_731.mjs` | pass |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | pass |
| `node scripts/test_keepsake_style2.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass (972 files) |
| `node scripts/test_offline_manifest.mjs` | pass (347 offline / 17 online) |
| `BASE=d3689e79 node scripts/check-code-ratchet.mjs` | **fail** — `fatal: invalid object name 'origin/d3689e79'` (worktree has no `origin/d3689e79`; host must rerun ratchet with PR base ref present) |

## Uncommitted files (host commit/push)

- `src/vacation/trek-style2-bundle.mjs`
- `src/vacation/trek-live-product-patches.mjs`
- `public/assets/index-BKun7ofk.js`
- `scripts/test_keepsake_style2.mjs`
- `scripts/test_hotel_itinerary_note_timeline_731.mjs` (new)
- `scripts/offline-tests.txt`
- `J/RECEIPT.md`

Not done: pushed PR head, CI on new SHA, Gate B capture, merge.
