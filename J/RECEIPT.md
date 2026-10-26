# PR #687 vkfill-687 — day-by-day duplicate hotel row (cursor-ubuntu, 2026-10-26)

**Start HEAD:** `777b77dce5d3101b17ad3c2e9f86e14964fe621e` (verified before edit).

## Root cause

TREK `Ci()` day timeline builds hotel stay rows via `Po`/`Mo` (Check-in, Sleep, Wake, Check-out). It also builds `zt` from every day-assigned place with `Ds(wn)` true, then the `for (const wn of zt)` loop can push a generic `type:"place"` row titled `mr(wn)` (bare hotel name, no time) above `Sleep: …`. That duplicates the hotel even when `Ds()` reads `le[Qt(G)].timeline` (ff62a4db). Hotels must not enter `zt`; they match `apps/vacation-client` `buildDayTimeline`, which skips hotel in the assignment loop.

**Fix:** `trek-style2-bundle.mjs` patches `Ci()` filter to `…&&Ds(wn)&&!Zi(wn)`; served bundle regenerated.

## Source changes (uncommitted; host publish)

| File | Change |
| --- | --- |
| `src/vacation/trek-style2-bundle.mjs` | `CI_ZT_DAY_ASSIGN_*` patch + served assert when `Ci()` present |
| `public/assets/index-BKun7ofk.js` | Regenerated via `renderServedTrekBundle` from upstream `06e47169699ffdee8accf48e74b0a247a8793ebc^` |
| `scripts/test_daybyday_hotel_no_duplicate_timeline_row_687.mjs` | New guard (bundle patch + reference `buildDayTimeline` model) |
| `scripts/offline-tests.txt` | Register new test |

## Tests run (worktree `777b77dc` + this diff)

- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — pass
- `node scripts/test_daybyday_hotel_no_duplicate_timeline_row_687.mjs` — pass
- `node scripts/test_keepsake_style2.mjs` — pass
- `node scripts/test_trek_bundle_strip.mjs` — pass
- `node scripts/test_served_trek_bundle.mjs` — pass

## NOT RUN (host / pipeline)

- Gate B on new head (`capture-staging.sh` / `gateb_compare.sh`)
- CI on pushed head

## Left alone (scope)

- Plane icon, two-line hotel descriptions, `gateb_coverage.py` flight name-match, baselines/checkers, R1–R9 data modules.
