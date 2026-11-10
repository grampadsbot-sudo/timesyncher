# PR #906 — #902 customer build stamp + vk merge (#884 / #927 / #905)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `7392475c290fb54c2c4fceabdd55b71d3e5bbded` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906`.

## Host merge `origin/vk` into PR branch

Host published merge through `7392475c` (base `f8d4748f8ea8104e8722fecaa383588d5d7b010c`). Conflicted: `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` only — resolved this round keeping both sides (#902 primary + #884 logo + vk carry). Staged vk tree: #927 splitter/hero, budget price parity, #925/#905 chat-itinerary sequential PUT merge, #884 logo-chip sources; `public/assets/index-BKun7ofk.js` rebaked after trek edits.

---

## Root cause (#884)

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji) in the same grid cell as the brand `img`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (#884 — product sources)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | Fallback hide on successful img paint; ink-center path |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` / `logoImgOnErrorInline`; Marriott favicon repair |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B `fallback_stack` DOM check |
| `apps/vacation-client/src/lib/logoChipHandlers.mjs` | Hide fallback on load; show on final error |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline regression |
| `public/assets/index-BKun7ofk.js` | Rebaked `node scripts/rebake_served_trek_bundle.mjs` @ lane END |

## #902 — hide customer-visible build stamp

**Bug:** Dark fixed footer with 7-char build sha visible on hub, static pages, and trip React shell (390 + 1280).

| Piece | What |
| --- | --- |
| `routes/version.mjs` | `BUILD_STAMP_INLINE_STYLE` + customer-hide asset URLs; visible bar only under `html[data-ts-debug-build]` (`?debug=1`). |
| Static HTML shells | `ts-build-stamp-customer-hide.{css,js}` linked; inline stamp style hides `footer[data-build-stamp="1"]` by default. |
| `shared-app.html` | vk `#root` flex column shell **and** customer hide on stamp footer; no vk `position: static !important` that resurfaced the bar. |
| `apps/vacation-client/src/components/BuildStampFooter.tsx` | Mount stamp footer for DOM/meta probes; `data-ts-debug-build` when `?debug=1`. |
| `apps/vacation-client/src/styles.css` | Hide `.tsv-build-footer` unless `?debug=1`. |
| `public/vacation-app-shell.css` | Hide stamp on `html:has(main.app)`. |

`<meta name="timesyncher-build">` and `/api/version` unchanged.

## Gate B / vk fixes carried in merge

| failure | root cause | fix |
| --- | --- | --- |
| `price budget-390/1280` | Budget used `thingBudgetAmount` on bare `place.price` only | `budgetLineAmount` uses `numericPrice` (`budgetModel.mjs`) |
| `daybyday-1280` hero chrome | #927 hero collapse at desktop width | `ts-trip-hero-collapse.js` mobile-only mount (≤844px) |

## Uncommitted source (host `git add`)

- Resolved `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` (conflict markers cleared; index still `UU` until host `git add`)
- Staged index: #884 logo paths, trek rebake, `scripts/offline-tests.txt` entry for `test_ui_884_logo_chip_fallback_hide.mjs`
- Working tree (not staged): `public/assets/index-BKun7ofk.js` rebake delta on top of index; `evidence/vacation-client-p2-*/*.png` refreshed by `shell-layout.mjs` — **do not ship** unless host wants those PNGs on the PR (out of #902/#884 scope)

**Host:** `git add` conflict files + index, `git commit --no-edit` or single publish commit on `vkfill/902-20261109163213`; push once. Gate B structure + CI on new head.

## Checks @ `7392475c` + this receipt (lane END)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | **PASS** sha256=9183847c… |
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | **PASS** |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | **PASS** |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | **PASS** |
| `node scripts/test_served_trek_bundle.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit_905.mjs` | **PASS** |
| `node apps/vacation-client/test/budget.unit.mjs` | **PASS** |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | **PASS** |
| `node scripts/test_vacation_app_927_touch_splitter.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** (1135 files) |
| `node scripts/test_offline_manifest.mjs` | **PASS** (441 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** (252 report, 0 fail) |

Gate B structure / host capture / evidence `J/evidence/hub-390.png` + `hub-1280.png` — host pipeline after push. Holds: `hold:test-trip-fixture` until Gate B verdict on pushed head (per `bot-admin/lanes/vk-pr-handoff/pr-906`).

## Left alone (scope)

- Baselines, Gate B capture scripts, workflows, `package.json` / lock, deploy config.
- DATA_FAULT replay risk on stale fixture (handoff) — not a UI patch in this round.
- Deploy config / force-push / Neon writes from lane.
- Keepsake QA not run (lean mode).
