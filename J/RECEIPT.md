# PR #906 — #902 build stamp + origin/vk merge (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (host commit + push). **Start HEAD:** `e451c6683c6698a1fe451499fd23c84b8bce22c1`.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906` — page_not_found on this pass (per lane brief).

## #902 — hide customer-visible build stamp (on HEAD; no new diff this round)

**Bug:** Dark fixed footer with 7-char build sha visible on hub/checkout/static pages and trip shell (390 + 1280).

**Fix (already on `e451c668`):**
1. **`routes/version.mjs`** — `BUILD_STAMP_INLINE_STYLE`: vite-injected `timesyncher-build-stamp-style` hides footer by default; visible fixed bar only under `html[data-ts-debug-build]` (`?debug=1` via `ts-build-stamp-customer-hide.js`).
2. **`vite.config.mjs`** / **`scripts/layout-shell-harness.mjs`** — shared inline style (no always-visible bar before external CSS loads).
3. **`apps/vacation-client/src/components/BuildStampFooter.tsx`** — always mount hidden stamp footer; `data-ts-debug-build` when `?debug=1`.
4. **`vacation-app-next.html`** — customer-hide assets + debug-only visible CSS; link `/ts-build-stamp-customer-hide.{css,js}`.

Meta `timesyncher-build` + `/api/version` unchanged. `public/ts-build-stamp-customer-hide.*` retained.

## Merged from origin/vk @ `2608a0ec` into `e451c668` (host base merge)

**Conflict:** `J/RECEIPT.md` only — resolved here keeping both PR intent (#902) and vk port notes (#905).

**Staged for host merge commit (behaviour from vk + #905 port on this branch):**

| Area | Files |
|------|-------|
| Chat itinerary edit day inference + queue failures | `src/vacation/chat-itinerary-edit-day.mjs`, `chat-itinerary-edit.mjs`, `chat-itinerary-edit-intent.mjs`, `routes/vacation-app-chat-queue.mjs`, `reply-trip-context-facts.mjs` |
| Tests | `scripts/test_chat_itinerary_edit.mjs`, `scripts/test_chat_itinerary_edit_905.mjs`, `scripts/offline-tests.txt` (+1 line) |
| Client | `DayTimeline.tsx`, `dayTimelineModel.mjs`, `logoChipHandlers.mjs` (Zinc `.ico` load fix) |
| Static app | `vacation-app.html` (inlined `showComposerStatus(customerSafeErrorMessage` catch per `test_reply_action_claim_d2_paia_save_route.mjs`), `public/vacation-app-request.js` |

**Turn-2 hang (#905; documented, not re-authored):** `resolveItineraryEditDayNumber` / `dayNumbersForPlace` infer day when place sits on one day; `prepareChatItineraryEditForQueueTurn` returns explicit `edit_failed` on overrides PUT failures (413 in tests); client 90s chat timeout.

**#890 rebrand** and other vk paths already on branch history — not restaged this merge.

## Uncommitted / host commit scope

- `J/RECEIPT.md` (this file, conflict markers cleared; index still `UU` until host `git add`)
- All paths in `git diff --cached` above
- Unstaged only (optional discard): `evidence/vacation-client-p2-*/*.png` touched by local `shell-layout.mjs` harness — not part of PR #906 intent
- Host: `git add J/RECEIPT.md`, finish merge commit if index still mid-merge, optional `node scripts/rebake_served_trek_bundle.mjs` if bundle drift, one push to `vkfill/902-20261109163213` (PR #906)

## Checks run @ `e451c668` + staged index + RECEIPT

| Command | Result |
|---------|--------|
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit_905.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit.mjs` | **PASS** |
| `node scripts/test_reply_action_claim_d2_paia_save_route.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** |
| `node scripts/test_offline_manifest.mjs` | **PASS** (436 offline, 18 online) |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | **PASS** |

Gate B / host capture / Keepsake QA live+PDF — not run (lean mode; host pipeline).

## Left alone (scope)

- Baselines, Gate B capture scripts, `.github/`, `package.json` / lock, deploy config.

**Host:** commit, push PR #906, CI + Gate B structure on build-stamp screens; evidence `hub-390.png` / `hub-1280.png` when captured.
