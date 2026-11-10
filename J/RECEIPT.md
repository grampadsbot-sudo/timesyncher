# PR #906 — #902 customer build stamp + vk merge (#884 / #927 / #905 / #903)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `7b96b9691311b255de0bceee3bdd356f06a042c5` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906`.

## Host merge `origin/vk` into PR branch

Host published merge base `ed8687b929c9473e6f9f2915ac5bc82d6dd802d1` into `7b96b969`. Conflicted: `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, `evidence/vacation-client-p2-*/*.png` (36 PNGs). Resolved this round keeping both sides (#902 primary + vk #884/#927/#905/#903 carry). `public/assets/index-BKun7ofk.js` rebaked via `node scripts/rebake_served_trek_bundle.mjs` → sha256 `acddd4e7783da2996c8eb61bfee84907fc5fb303edd88d7b664743a74792f713`.

---

## Root cause (#884 — vk carry)

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

## #903 (vk carry — stored data)

- No serve-time title/narrative rewrites in `live-qa-903-presentation.mjs`.
- `GATE_B_DISPLAY_TITLE_ALIASES[609]` retained for ccab provenance.

## Gate B / vk fixes carried in merge

| failure | root cause | fix |
| --- | --- | --- |
| `price budget-390/1280` | Budget used `thingBudgetAmount` on bare `place.price` only | `budgetLineAmount` uses `numericPrice` (`budgetModel.mjs`) |
| `daybyday-1280` hero chrome | #927 hero collapse at desktop width | `ts-trip-hero-collapse.js` mobile-only mount (≤844px) |

## Uncommitted source (host `git add`)

- Resolved `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` (conflict markers cleared)
- Resolved 36 `evidence/vacation-client-p2-*/*.png` (vk stage-3 bytes; host may regenerate via `shell-layout.mjs` before ship)
- Working tree: `public/assets/index-BKun7ofk.js` rebake delta

**Host:** `git add` conflict files + merge index, `git commit --no-edit` on `vkfill/902-20261109163213`; push once. Gate B structure + CI on new head.

## Checks @ `7b96b969` + this receipt (lane END)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | **PASS** sha256=acddd4e7… |
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | **PASS** |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | **PASS** |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | **PASS** |
| `node scripts/test_served_trek_bundle.mjs` | **PASS** |
| `node scripts/test_pr336_ccab_search_provenance.mjs` | **PASS** |
| `node scripts/test_shared_tab_list_summary.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit_905.mjs` | **PASS** |
| `node apps/vacation-client/test/budget.unit.mjs` | **PASS** |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | **PASS** |
| `node scripts/test_vacation_app_927_touch_splitter.mjs` | **PASS** |
| `node scripts/test_vacation_app_shell.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** (1139 files) |
| `node scripts/test_offline_manifest.mjs` | **PASS** (443 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** (252 report, 0 fail) |

Gate B structure / host capture / evidence `J/evidence/hub-390.png` + `hub-1280.png` — host pipeline after push. Holds: `hold:test-trip-fixture` until Gate B verdict on pushed head (per `bot-admin/lanes/vk-pr-handoff/pr-906`).

## Left alone (scope)

- Baselines, Gate B capture scripts, workflows, `package.json` / lock, deploy config.
- DATA_FAULT replay risk on stale fixture (handoff) — not a UI patch in this round.
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
