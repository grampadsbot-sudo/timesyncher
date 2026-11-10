# TSV #944 — Day 1 conflict banner wrap + one-line time/TZ at 390 (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted). **Lane start HEAD:** `5a0d72e5a607fa4234bf687a956bb34e96cd10e2`. **Lane:** cursor-ubuntu. **Authority:** eggbot 5:56 AM PT 11/10 (`eggbot:banner-tz-clip-20261110-0556`).

## Root cause

Served trek bundle patches regressed Day-by-Day at 390: `CONFLICT_LABEL` used `flexWrap:"nowrap"` + `overflow:"hidden"` (clip), and the timeline grid time column was `minmax(52px,64px)` — too narrow for `12:37 pm PT` after #891 TZ labels.

## Changes

| Path | Change |
| --- | --- |
| `src/vacation/trek-shared-layout-patches.mjs` | `patchConflictTimelineLabel`: wrap conflict banners (`flexWrap:"wrap"`, visible overflow); widen day grid time column to `minmax(72px,80px)` (replaces 52–64px patch). |
| `src/vacation/trek-live-product-patches.mjs` | Call `patchConflictTimelineLabel` (file-size ratchet). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `scripts/rebake_served_trek_bundle.mjs` (sha256 `103a61787a19ec3c134a3bc3ecc5de67bc1876e96b357e841d5282e3cdc9e43c`). |
| `apps/vacation-client/src/styles.css` | Vacation-client timeline: 80px time column, `white-space: nowrap` on times (parity). |
| `scripts/test_issue_944_daybyday_banner_tz_390.mjs` | 390 Puppeteer: conflict `scrollWidth <= clientWidth`, no nowrap+hidden clip; PT/ET not orphan line under clock. |
| `scripts/offline-tests.txt` | Register new offline test. |

**Unchanged:** conflict calc (`applyDayTimelineConflictFlags`, flight patches), #891 TZ text, NYC lock/trip 99, Gate B baselines/thresholds, git metadata.

## Checks

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_944_daybyday_banner_tz_390.mjs` | PASS |
| `node scripts/test_issue_928_daybyday_arrival_conflicts.mjs` | PASS |
| `node scripts/test_issue_887_daybyday_time_column.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (446 offline) |
| `node scripts/check-no-comments.mjs` | PASS (after `apps/vacation-client/npm install` in worktree) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

## Host publish

Uncommitted: 6 paths above + `J/RECEIPT.md`. Branch `vkfill/944-20261110055619`, one push, PR into `vk` with `Closes #944`. Ref: start HEAD `5a0d72e5`.
