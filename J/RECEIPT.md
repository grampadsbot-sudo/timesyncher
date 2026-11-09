# Issue #877 — Thing image close leaves logo chips (cursor-ubuntu)

Start HEAD: `b2b8bbc076fcae30da54aa43f878cd3bd9178900` (live tip at brief write).

## Root cause

`public/ts-timeline-icon-patch.js` MutationObserver `apply()`→`mark()` treated `[data-ts-pic-thumb-wrap]` media slots (42px) as `isTinyIconSlot` (≤48px) when the Nr pic popup mounted. `mark()` rewrote photo/QR thumbs into `data-ts-logo-chip` / favicon `tiny-logo`. Closing the popup removed `[data-ts-pic-popup]` but left logo chips.

## Fix

| Path | Change |
| --- | --- |
| `public/ts-timeline-icon-patch.js` | Added `isPicMediaNode()`; `isTinyIconSlot`, `mark`, and `apply` skip `[data-ts-pic-thumb-wrap]`, `[data-ts-pic-popup]`, and `.print-media-qr`. |
| `src/vacation/list-row-pic-popup-audit.mjs` | `auditListRowPicPopupMediaStrip()` — popup clean + no logo chips + photo `/ts-thing-media/` + QR present. |
| `scripts/test_ui_877_pic_popup_media_strip.mjs` | Offline patch + audit unit checks. |
| `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | NYC 8CQX Statue card open→Escape at 390+1280; screenshots to `vkfill-877-job/`. |
| `scripts/offline-tests.txt` | Registered both #877 tests. |

## Local proof (uncommitted, worktree `vkfill-877-20261109104314`)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_877_pic_popup_media_strip.mjs` | PASS |
| `node scripts/test_ui_866_pic_popup_close.mjs` | PASS (regression) |
| `node scripts/test_offline_manifest.mjs` | PASS (428 offline) |
| `node scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | **BLOCKED** — worktree has no `node_modules` (`@neondatabase/serverless` via `shared-trip-served-page.mjs`; same as #866 chrome harness) |
| `node scripts/check-no-comments.mjs` | **BLOCKED** — missing `apps/vacation-client/node_modules/typescript` |
| `BASE=vk node scripts/check-code-ratchet.mjs` | Not run (blocked on above) |

Host: `npm ci` (or lane bootstrap), then chrome test + pre-DONE gates, then commit → push once → PR `Closes #877`.

## Gate B / screen_probe

Permanent audit lives in-repo (`auditListRowPicPopupMediaStrip` + `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs`). Lane rules forbid editing `~/tsv-dispatch/screen_probe.mjs`; host may wire that script or CI to invoke the chrome test on NYC shared slug.

## Uncommitted files (host publish)

- `public/ts-timeline-icon-patch.js`
- `src/vacation/list-row-pic-popup-audit.mjs`
- `scripts/test_ui_877_pic_popup_media_strip.mjs`
- `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs`
- `scripts/offline-tests.txt`
- `J/RECEIPT.md`

Evidence dir (after chrome): `/home/ubishere9995/tsv-work/vkfill-877-job/877-statue-{before,open,after}-{390,1280}.png`
