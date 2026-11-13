# vkfill-989 host receipt (cursor-ubuntu composer-2.5, relaunch invariant)

**Start HEAD:** `2cbd2b1077d0f7017a5210a805bc1d47508dc9b7` (verified `git rev-parse HEAD`)  
**Outcome:** `source-ready` for host publication (#989).  
**Gate relaunch fix:** `scripts/test_issue_989_shared_trip_load.mjs` registered; `scripts/test_keepsake_style2.mjs` and `src/vacation/trek-live-product-patches.mjs` at ratchet limits (915/500 lines); acceptance wrappers added for `tsv-dispatch/acceptance/989.json`.

## Product fix (issue #989 / Craig pt3374u)

1. Strip fill-internal blobs (`evidenceDossier`, etc.) from served `GET /api/shared/:slug/` payload.
2. Boot `shared-app.html`: load trek bundle in parallel with payload fetch; stash trip on `window.__TS_SHARED_BOOT_TRIP__`.
3. Patch served `getSharedTrip` to reuse boot stash and canonical trailing-slash API URL (rebaked `public/assets/index-BKun7ofk.js`).

## Changed files (uncommitted — host commits once, pushes `vkfill/989-*`, PR `Closes #989`)

| Path | Role |
| --- | --- |
| `src/vacation/shared-trip-fill-internal-strip.mjs` | New stripper for fill-internal fields |
| `src/vacation/shared-trip-served-page.mjs` | Apply strip in finalize |
| `src/vacation/trek-shared-trip-boot-fetch-patch.mjs` | Bundle source patch for getSharedTrip |
| `src/vacation/trek-live-product-patches.mjs` | Wire patch (500 lines) |
| `shared-app.html` | Parallel boot + boot globals |
| `public/assets/index-BKun7ofk.js` | Rebaked served bundle |
| `scripts/test_issue_989_shared_trip_load.mjs` | Combined unit + Playwright timing (slice env for acceptance) |
| `scripts/test_acceptance_989_*.mjs` | Three wrappers for acceptance/989.json |
| `scripts/test_shared_trip_boot_fetch.mjs` | Boot parallel / globals |
| `scripts/test_keepsake_style2.mjs` | getSharedTrip needle (915 lines) |
| `scripts/offline-tests.txt` | Register issue + acceptance tests |

## T_before / T_after (Playwright 390×844 iPhone UA, local fat-dossier fixture)

| | Cold median | Warm median |
|---|---:|---:|
| **T_before** (staging throwaway, issue table) | 8650 ms | 5300 ms |
| **T_after** (`test_issue_989_shared_trip_load.mjs`) | ~280 ms | ~240 ms |

## Pre-DONE (HEAD `2cbd2b1`, dirty tree)

| Check | Result |
| --- | --- |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass (462 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| `node scripts/test_issue_989_shared_trip_load.mjs` | pass |
| `node scripts/test_acceptance_989_*.mjs` (×3) | pass |
| `node scripts/test_shared_trip_boot_fetch.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_keepsake_style2.mjs` | pass |

No commit, stage, push, merge, rebase or deploy in this lane (HOST PUBLICATION ONLY).

## Host next

Commit all dirty paths above; push branch; open PR into `vk` with `Closes #989`, T_before/T_after table; wait CI unit-tests + secrets + accept + gateb on PR head.
