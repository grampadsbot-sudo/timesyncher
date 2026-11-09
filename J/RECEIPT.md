# Issue #877 round 2 — pic viewer fullscreen / resize / pinch (cursor-ubuntu)

Start HEAD: `b7777808e2a57b4ab7409f3bb90c6600b3665625` (PR #878).

Authority: Craig 2026-11-09 ~10:49 AM PT — fullscreen, resize, pinch on Thing pic popup; keep round-1 logo-chip fix.

## Round 1 (on tip)

`public/ts-timeline-icon-patch.js` `isPicMediaNode()` — logo chips no longer appear after pic popup close. Offline + audit harness in `list-row-pic-popup-audit.mjs`.

## Round 2 change

| Path | Change |
| --- | --- |
| `public/ts-pic-popup-viewer.js` | **New.** Enhances `[data-ts-pic-popup]`: fullscreen (API + fixed overlay fallback), size toggle, SE resize handle, pinch-zoom on image. |
| `shared-app.html` | Load `ts-pic-popup-viewer.js` on shared journey. |
| `src/vacation/trek-nr-pic-popup-patches.mjs` | Escape closes popup only when not fullscreen (`window.__tsPicFsActive` / overlay / `document.fullscreenElement`). |
| `src/vacation/list-row-pic-popup-audit.mjs` | `auditPicViewerGlobalClean()` for leftover fullscreen overlay. |
| `scripts/test_ui_877_pic_popup_media_strip.mjs` | Assert viewer script + escape patch + audits. |
| `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | Open → resize/pinch → fullscreen → exit → Escape → strip audit at 390+1280; serves patched bundle + viewer; evidence under `vkfill-877-20261109105332-job/`. |

## Local proof (uncommitted, worktree `vkfill-878-20261109105332`)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_877_pic_popup_media_strip.mjs` | PASS |
| `node scripts/test_ui_866_pic_popup_close.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (428 offline) |
| `node scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | **BLOCKED** — worktree has no `node_modules` (`@neondatabase/serverless` via `shared-trip-served-page.mjs`) |
| `node scripts/check-no-comments.mjs` | Not run (missing client TS dep without `npm ci`) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | Not run |

Host: `npm ci`, chrome test + pre-DONE gates, commit → push once → PR #878.

## Gate B / screen_probe

Permanent harness: `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` (flow `open-fullscreen-exit-close`). Lane rules forbid editing `~/tsv-dispatch/screen_probe.mjs`; host wires CI/Gate B to invoke this script on NYC 8CQX shared slug.

## Uncommitted files (host publish)

- `public/ts-pic-popup-viewer.js`
- `shared-app.html`
- `src/vacation/trek-nr-pic-popup-patches.mjs`
- `src/vacation/list-row-pic-popup-audit.mjs`
- `scripts/test_ui_877_pic_popup_media_strip.mjs`
- `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs`
- `J/RECEIPT.md`

Evidence (after chrome): `/home/ubishere9995/tsv-work/vkfill-877-20261109105332-job/877-statue-{before,open,fullscreen,after}-{390,1280}.png`
