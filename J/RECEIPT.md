# PR #906 — #902 customer build stamp (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted; host commit + push). **Start HEAD:** `c34dcf77b2e28dfa753513a2a5c4854f67875562` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906` (per lane brief).

## Host merge

Host published merge commit `c34dcf77` (`origin/vk` @ `b8b9f13f` into PR branch). Includes `shared-app.html` trip shell plus vk `#915` vkprloop drift paths. Conflicted `J/RECEIPT.md` left `UU` until this round.

## Conflict resolution (this round)

| file | resolution |
| --- | --- |
| `J/RECEIPT.md` | Cleared markers; kept **PR #906 / #902** receipt as primary; retained vk guidance that `scripts/offline-tests.txt` lists **both** `test_vkprloop_drift_921.mjs` (#921) and `test_vkprloop_drift_915.mjs` (already on `c34dcf77`). |

No `public/assets/*.js` conflict; rebake not required on this pass.

## #902 — hide customer-visible build stamp

**Bug:** Dark fixed footer with 7-char build sha visible on hub, static pages, and trip React shell (390 + 1280).

**Fix (on branch; no extra product edits this round):**

| Piece | What |
| --- | --- |
| `routes/version.mjs` | `BUILD_STAMP_INLINE_STYLE` + customer-hide asset URLs; visible bar only under `html[data-ts-debug-build]` (`?debug=1`). |
| Static HTML shells | `ts-build-stamp-customer-hide.{css,js}` linked; inline `timesyncher-build-stamp-style` hides `footer[data-build-stamp="1"]` by default. |
| `shared-app.html` @ `c34dcf77` | vk `#root` flex column shell **and** customer hide on `footer[data-build-stamp="1"]` (clip/visibility); no vk `position: static !important` that resurfaced the bar. |
| `apps/vacation-client/src/components/BuildStampFooter.tsx` | Mount stamp footer for DOM/meta probes; `data-ts-debug-build` when `?debug=1`. |
| `apps/vacation-client/src/styles.css` | Hide `.tsv-build-footer` in bundled client CSS unless `?debug=1`. |

`<meta name="timesyncher-build">` and `/api/version` unchanged.

## Staged index (host publish with this receipt)

| path | notes |
| --- | --- |
| `scripts/fixtures/vkprloop-drift-921.txt` | vk #921 |
| `scripts/test_vkprloop_drift_921.mjs` | vk #921 |
| `scripts/offline-tests.txt` | register `test_vkprloop_drift_921.mjs` |
| `src/vacation/chat-itinerary-edit.mjs`, `chat-itinerary-edit-day.mjs`, `scripts/test_chat_itinerary_edit.mjs` | vk #905 chat itinerary follow-up |

## Uncommitted source (host `git add`)

- `J/RECEIPT.md` (this file)
- Above staged paths (`git diff --cached`)

**Host:** `git add J/RECEIPT.md`, commit staged tree once, push `vkfill/902-20261109163213` (PR #906). Then Gate B structure + CI on new head.

## Checks @ `c34dcf77` + this receipt

| Command | Result |
| --- | --- |
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
| `node scripts/test_vacation_app_shell.mjs` | **PASS** |
| `node scripts/test_vkprloop_drift_921.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** (1132 files) |
| `node scripts/test_offline_manifest.mjs` | **PASS** (439 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** (252 report, 0 fail) |

Gate B structure / host capture / evidence `J/evidence/hub-390.png` + `hub-1280.png` — host pipeline after push. Holds: `hold:test-trip-fixture` until Gate B verdict on pushed head (per handoff).

## Left alone (scope)

- Baselines, Gate B capture scripts, workflows, `package.json` / lock, deploy config.
- Baseline PNG churn already on `c34dcf77` — not edited this round.

Keepsake QA not run (lean mode).
