# Issue #877 round 3 — fullscreen image fit + real controls (cursor-ubuntu)

Start HEAD: `1f1d4c3f9459c1801397868c77cf66ffe26efa84` (vk when brief written).

Authority: Craig 2026-11-09 ~11:42 AM PT — fullscreen uses dark backdrop + object-fit contain; image must cover ≥85% viewport; real Full screen + X controls; keep r1 logo-chip + r2 lifecycle.

## Root cause (r3)

Desktop fullscreen used `popup.requestFullscreen()`, so the white popup panel filled the viewport but the photo stayed a small strip at the top (~80% blank). Gate B only checked popup width, not rendered image box.

## Change

| Path | Change |
| --- | --- |
| `public/ts-pic-popup-viewer.js` | Always mount `[data-ts-pic-fs-overlay]` (dark `#0f172a`, flex stage). Image box sized to ~96vw × ~88vh with `object-fit:contain`; caption gradient at bottom; 48px SVG close; backdrop tap + Escape; popup bar uses 44px SVG Full screen + Close (not stub glyphs). Removed element-fullscreen white panel path. Pinch unchanged. |
| `src/vacation/list-row-pic-popup-audit.mjs` | `measurePicFullscreenImageCoverage()` for Gate B ratio ≥0.85. |
| `scripts/test_ui_877_pic_popup_media_strip.mjs` | Assert overlay img, object-fit, close control, coverage helper unit check. |
| `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | Fail-closed `max(w/vw,h/vh)>=0.85` at 390+1280; dark backdrop + exit control; evidence dir `vkfill-877-20261109114313-job/`. |

## Local proof (uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_877_pic_popup_media_strip.mjs` | PASS (`1f1d4c3f9459c1801397868c77cf66ffe26efa84` worktree) |
| `node scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | PASS 390+1280 open→fullscreen→exit→close |
| `node scripts/test_ui_866_pic_popup_close.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (428 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

Evidence: `/home/ubishere9995/tsv-work/vkfill-877-20261109114313-job/877-statue-{before,open,fullscreen,after}-{390,1280}.png`

## Gate B / screen_probe

Permanent harness: `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` (≥85% image coverage assertion). Lane rules forbid editing `~/tsv-dispatch/screen_probe.mjs`; host wires CI/Gate B to invoke this script.

## Uncommitted files (host publish)

- `public/ts-pic-popup-viewer.js`
- `src/vacation/list-row-pic-popup-audit.mjs`
- `scripts/test_ui_877_pic_popup_media_strip.mjs`
- `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs`
- `J/RECEIPT.md`

## Out of scope (left alone)

`~/tsv-dispatch/screen_probe.mjs`, baselines, live NYC 8CQX trip data, round-1 `ts-timeline-icon-patch.js` (already on tip).
