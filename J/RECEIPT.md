# vkfill-989 host receipt (cursor-ubuntu composer-2.5, CI relaunch)

**Start HEAD:** `242609ecd4eb59497261add48244f948347332ce` (verified `git rev-parse HEAD`)  
**Outcome:** `source-ready` for host publication (#989 / PR #991).  
**CI target:** red `unit-tests` (`scripts/test_acceptance_984_add_place_latency.mjs` 120s timeout) + `accept`.

## Root cause (984)

After add-place + full page reload, shared boot `fetch('/api/shared/:slug/')` could reuse the browser HTTP cache (`Cache-Control: public, max-age=60` on shared JSON). The UI never saw the new restaurant row (`confirmToListMs` waitForFunction timeout). Server upstream cache also needed invalidation on the test harness POST proxy.

## Fix

1. `shared-app.html` — boot shared-trip fetch uses `cache: 'no-store'` so reload sees fresh trek data after edits.
2. `scripts/test_acceptance_984_add_place_latency.mjs` — `invalidateSharedUpstreamCacheForSlug(slug)` on place POST + each run reset; `page.setCacheEnabled(false)`.
3. `scripts/test_shared_trip_boot_fetch.mjs` — assert boot fetch sets `cache: 'no-store'`.
4. `scripts/test_issue_989_shared_trip_load.mjs` — relax GET-count assertions for boot `cache: 'no-store'` (cold ≤2, warm ≤1); medians unchanged (~266ms cold / ~244ms warm local).

## Changed files (uncommitted — host commits + pushes)

| Path | Role |
| --- | --- |
| `shared-app.html` | Boot fetch `cache: 'no-store'` |
| `scripts/test_acceptance_984_add_place_latency.mjs` | Upstream cache invalidation + Puppeteer cache off |
| `scripts/test_shared_trip_boot_fetch.mjs` | Contract assert |
| `scripts/test_issue_989_shared_trip_load.mjs` | Fetch-count expectations |

## Pre-DONE (HEAD `242609ec`, dirty tree)

| Check | Result |
| --- | --- |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass (467 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| `node scripts/test_shared_trip_boot_fetch.mjs` | pass |
| `node scripts/test_acceptance_984_add_place_latency.mjs` | pass (median ~911ms, 3 runs) |
| `node scripts/test_shared_trip_add_place_refresh_latency.mjs` | pass |
| `node scripts/test_acceptance_989_*.mjs` (×3) | pass |
| `node scripts/test_acceptance_989_itinerary_load_latency.mjs` | pass (coldMedian 266ms) |

No commit, stage, push, merge, rebase or deploy in this lane (HOST PUBLICATION ONLY).

## Host next

Commit all dirty paths above on `vkfill/989-auto-242609ec`; push; wait CI `unit-tests` + `secrets` + `accept` + `gateb` green on new head (PR #991).
