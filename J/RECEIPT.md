# PR #906 — #902 customer build stamp + vk merge conflict round

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `7a978cf389591ab816eafeaade85a6be20ca0b50` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906`.

## Host merge `origin/vk` @ `1fc2ef7708aeed7a318b11b9fb3fef518f1b4044` into `7a978cf3`

| Path | Resolution |
| --- | --- |
| `J/RECEIPT.md` | Merged both sides: #902 receipt + vk #558/#928 carry (this file). |
| `public/assets/index-BKun7ofk.js` | vk merge bytes + `node scripts/rebake_served_trek_bundle.mjs` → sha256 `31e9a3798d0a68adbc154e850d1ea263f9c609ba66112af115f4330703fc8364`. |
| vk product carry | `#928` arrival-day conflict flags (`day-by-day-flight-conflicts.mjs`, trek patches, 390 banner wrap in `styles.css`, `dayTimelineModel.mjs` delta). |
| `#558` test harness | `scripts/test_ui_558_daybyday_time_name_baseline.mjs` waits for Day chip + timeline fingerprint; `scripts/test_issue_928_daybyday_arrival_conflicts.mjs` (registered in `scripts/offline-tests.txt`). |

Prior host merge (earlier round) already resolved `J/PR_DESCRIPTION.md`, 36 `evidence/vacation-client-p2-*/*.png`, and logo/#884 carry — unchanged this round.

## #902 — hide customer-visible build stamp (already on PR head; not re-authored)

**Bug:** Dark fixed footer with 7-char build sha visible on hub, static pages, and trip React shell (390 + 1280).

| Piece | What |
| --- | --- |
| `routes/version.mjs` | Customer-hide asset URLs; visible bar only under `html[data-ts-debug-build]` (`?debug=1`). |
| Static HTML shells + `public/ts-build-stamp-customer-hide.{css,js}` | Hide `footer[data-build-stamp="1"]` by default. |
| `shared-app.html` | vk `#root` flex column shell **and** customer hide on stamp footer. |
| `apps/vacation-client/src/components/BuildStampFooter.tsx` | Mount stamp for DOM/meta probes; `data-ts-debug-build` when `?debug=1`. |
| `apps/vacation-client/src/styles.css` | Hide `.tsv-build-footer` unless `?debug=1`. |

`<meta name="timesyncher-build">` and `/api/version` unchanged. Gate B PASS on pre-merge head `7a978cf3` per handoff (capture `textContent` host fix).

## #558 — day-by-day time/name baseline (vk carry)

**Root cause:** Test clicked Day chips without waiting; every pass still read Day 1. #928 conflict flags on Day 1 left zero eligible single-time rows.

**Fix:** Wait for timeline title fingerprint after Day chip click; measure Day 1 + Day 2; assert Statue or Strand when sampled; keep conflict-row skip rule.

## Uncommitted source (host `git add` + merge commit)

- `J/RECEIPT.md` (conflict markers cleared)
- `public/assets/index-BKun7ofk.js` (rebaked)
- `apps/vacation-client/src/lib/dayTimelineModel.mjs`, `apps/vacation-client/src/styles.css`
- `src/vacation/day-by-day-flight-conflicts.mjs`, `trek-live-product-flight-day-patches.mjs`, `trek-live-product-patches.mjs`
- `scripts/test_ui_558_daybyday_time_name_baseline.mjs`, `scripts/test_issue_928_daybyday_arrival_conflicts.mjs`, `scripts/offline-tests.txt`
- `.artifacts/nyc-screen-verify/screenshots/pt3019-cars-brand-*-preview.png` (4 files; host should confirm intent before ship)

**Host:** `git add` merge index + paths above, `git commit --no-edit` on `vkfill/902-20261109163213`; push once. Gate B structure + CI on new head.

## Checks @ `7a978cf3` + vk merge working tree (lane END)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | **PASS** sha256=31e9a379… |
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
| `node scripts/test_ui_558_daybyday_time_name_baseline.mjs` | **PASS** |
| `node scripts/test_issue_928_daybyday_arrival_conflicts.mjs` | **PASS** |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | **PASS** |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | **PASS** |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | **PASS** |
| `node scripts/test_served_trek_bundle.mjs` | **PASS** |
| `node apps/vacation-client/test/budget.unit.mjs` | **PASS** |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** (1141 files) |
| `node scripts/test_offline_manifest.mjs` | **PASS** (444 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** (252 report, 0 fail) |

Gate B structure on pushed head — host pipeline after push (`bot-admin/lanes/vk-pr-handoff/pr-906`).

## Left alone (scope)

- Baselines, Gate B capture scripts, workflows, `package.json` / lock, deploy config.
- #902 product code — no further coder round per handoff.
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
