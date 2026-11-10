# PR #906 — #902 customer build stamp + vk merge conflict resolve

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `6bdaf42f7530ea9e2dd91002338ac1b01e20270c` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906`.

## Host merge @ `6bdaf42f`

Host published merge `6bdaf42f` (`origin/vk` @ `1ffd23ca` into `c34dcf77`). Brings vk #922 / #905 chat-itinerary sequential PUT merge (`mergeStoredChatItineraryScheduleOverride` in `src/vacation/chat-itinerary-edit-day.mjs`) plus prior #902 build-stamp work on the PR branch.

**Conflict resolution (this round):**

| file | resolution |
| --- | --- |
| `J/RECEIPT.md` | Cleared `<<<<<<<` markers; **PR #906 / #902** receipt is primary; noted vk #905 chat paths in staged index (below). |

No `public/assets/*.js` conflict on this merge; rebake not required.

## #902 — hide customer-visible build stamp (on branch head)

**Bug:** Dark fixed footer with 7-char build sha visible on hub, static pages, and trip React shell (390 + 1280).

**Fix (already on `6bdaf42f`; re-verified this round):**

| Piece | What |
| --- | --- |
| `routes/version.mjs` | `BUILD_STAMP_INLINE_STYLE` + customer-hide asset URLs; visible bar only under `html[data-ts-debug-build]` (`?debug=1`). |
| Static HTML shells | `ts-build-stamp-customer-hide.{css,js}` linked; inline `timesyncher-build-stamp-style` hides `footer[data-build-stamp="1"]` by default. |
| `shared-app.html` | vk `#root` flex column shell **and** customer hide on `footer[data-build-stamp="1"]` (clip/visibility); no vk `position: static !important` that resurfaced the bar. |
| `apps/vacation-client/src/components/BuildStampFooter.tsx` | Mount stamp footer for DOM/meta probes; `data-ts-debug-build` when `?debug=1`. |
| `apps/vacation-client/src/styles.css` | Hide `.tsv-build-footer` in bundled client CSS unless `?debug=1`. |

`<meta name="timesyncher-build">` and `/api/version` unchanged.

## Staged index (host publish with this receipt)

From vk merge; keep with conflict resolve commit:

| path | notes |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs`, `chat-itinerary-edit-day.mjs` | vk #905 merge-on-put |
| `scripts/test_chat_itinerary_edit.mjs`, `scripts/test_chat_itinerary_edit_905.mjs` | #905 regression |

## Uncommitted source (host `git add`)

- `J/RECEIPT.md` (this file, conflict resolved)
- `J/PR_DESCRIPTION.md` (head SHA + merge note for host PR body)

**Host:** `git add J/RECEIPT.md J/PR_DESCRIPTION.md`, commit merge resolution + staged tree once, push `vkfill/902-20261109163213` (PR #906). Then Gate B structure + CI on new head.

## Checks @ `6bdaf42f` + this receipt

| Command | Result |
| --- | --- |
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit_905.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** (1132 files) |
| `node scripts/test_offline_manifest.mjs` | **PASS** (439 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** (252 report, 0 fail) |

Gate B structure / host capture / evidence `J/evidence/hub-390.png` + `hub-1280.png` — host pipeline after push. Holds: `hold:test-trip-fixture` until Gate B verdict on pushed head (per `bot-admin/lanes/vk-pr-handoff/pr-906`).

## Left alone (scope)

- Baselines, Gate B capture scripts, workflows, `package.json` / lock, deploy config.
- DATA_FAULT replay risk on stale fixture (handoff) — not a UI patch in this round.

Keepsake QA not run (lean mode).
