# PR #906 — #902 customer build stamp + vk merge conflict resolve

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `d627872fe9dbca667d76c25621b5de6017f15fa5` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906`.

## Host merge `origin/vk` into PR branch

Host published merge through `d627872f` (conflicted: `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` only in this round). Brings vk #922 / #905 chat-itinerary sequential PUT merge (`mergeStoredChatItineraryScheduleOverride` in `src/vacation/chat-itinerary-edit-day.mjs`), #927 touch splitter + hero collapse, budget price parity, plus prior #902 build-stamp work on the PR branch.

| file | resolution |
| --- | --- |
| `J/PR_DESCRIPTION.md` | Both sides: #902 primary + vk #927/#905/budget notes |
| `J/RECEIPT.md` | This file; markers cleared |
| Staged from merge (no re-author) | `src/vacation/chat-itinerary-edit*.mjs`, `scripts/test_chat_itinerary_edit*.mjs`, #927 splitter/hero paths per index |

No `public/assets/*.js` conflict on this merge; rebake not required.

## Gate B / vk fixes carried in merge index (not #902)

| failure | root cause | fix |
| --- | --- | --- |
| `price budget-390/1280` | Budget used `thingBudgetAmount` on bare `place.price` only | `budgetLineAmount` uses `numericPrice` (`apps/vacation-client/src/lib/budgetModel.mjs`) |
| `daybyday-1280` hero chrome | #927 hero collapse at desktop width | `public/ts-trip-hero-collapse.js` mobile-only mount (`max-width: 844px`) |

## #902 — hide customer-visible build stamp

**Bug:** Dark fixed footer with 7-char build sha visible on hub, static pages, and trip React shell (390 + 1280).

**Fix (on branch; re-verified this round):**

| Piece | What |
| --- | --- |
| `routes/version.mjs` | `BUILD_STAMP_INLINE_STYLE` + customer-hide asset URLs; visible bar only under `html[data-ts-debug-build]` (`?debug=1`). |
| Static HTML shells | `ts-build-stamp-customer-hide.{css,js}` linked; inline stamp style hides `footer[data-build-stamp="1"]` by default. |
| `shared-app.html` | vk `#root` flex column shell **and** customer hide on stamp footer; no vk `position: static !important` that resurfaced the bar. |
| `apps/vacation-client/src/components/BuildStampFooter.tsx` | Mount stamp footer for DOM/meta probes; `data-ts-debug-build` when `?debug=1`. |
| `apps/vacation-client/src/styles.css` | Hide `.tsv-build-footer` unless `?debug=1`. |
| `public/vacation-app-shell.css` | Hide stamp on `html:has(main.app)`. |

`<meta name="timesyncher-build">` and `/api/version` unchanged.

## Staged index (host publish with this receipt)

| path | notes |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs`, `chat-itinerary-edit-day.mjs` | vk #905 merge-on-put |
| `scripts/test_chat_itinerary_edit.mjs`, `scripts/test_chat_itinerary_edit_905.mjs` | #905 regression |
| #927 / budget / shell | per `git diff --cached` at lane END |

## Uncommitted source (host `git add`)

- `J/RECEIPT.md`, `J/PR_DESCRIPTION.md` (conflict resolved)

**Host:** resolve merge index, `git add` conflict files + any unstaged receipt paths, `git commit --no-edit` or single publish commit on `vkfill/902-20261109163213`; push once. Then Gate B structure + CI on new head.

## Checks @ `d627872f` + this receipt

| Command | Result |
| --- | --- |
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
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
- Live override narratives for 664/669/672 bundle copy until host re-fill.
- Deploy config / force-push / Neon writes from lane.
- Keepsake QA not run (lean mode).
