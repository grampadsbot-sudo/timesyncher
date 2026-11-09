# PR #872 — host vk merge + #865 / #877 (cursor-ubuntu)

Start HEAD: `8678fab4583be40f190dc782122e9e0bb8a2d96c` (lane `vkfill-872-20261109122306`).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-872`: **page_not_found** (brief HANDOFF FETCH FAILED).

Host merged `origin/vk` at `d25b86b355623efe24dc56a252db47a19eeb80b0` into `8678fab4`; conflict only in this receipt.

## Issue #865 (PR intent; on branch)

Divider full drag, full-width chat bubbles, header mic removed from trip header hero row; composer mic retained. `test_vacation_app_865_chrome.mjs`, layout probes `PUBLIC-NOMIC`, `SITE-BUBBLE-WIDTH`, divider shots in `test_served_page_layout.mjs`.

`public/ts-shared-audio-recorder.js`: wires existing `[data-ts-shared-audio]` with aria/title `Record voice note` + `beginRecording` (no header auto-inject).

## Issue #877 (from vk merge)

Fullscreen pic popup: dark backdrop, `object-fit: contain`, ≥85% viewport image coverage; `public/ts-pic-popup-viewer.js`, `list-row-pic-popup-audit.mjs`, `test_ui_877_pic_popup_media_strip*.mjs`.

## Conflict resolution (this round)

| Path | Change |
| --- | --- |
| `J/RECEIPT.md` | Merged both receipt bodies (this file). |
| `public/assets/index-BKun7ofk.js` | vk merge version + `node scripts/rebake_served_trek_bundle.mjs` (sha256 `6748012103be769972219c26b9406f943d410f6aae625b873ffb839fe96b8780`). |
| `scripts/test_shared_trip_spa_console.mjs` | Serve `/ts-pic-popup-viewer.js` in harness (fix 404 after `shared-app.html` script tag from #877). |
| `scripts/layout-shell-harness.mjs` | Same static map entry for layout/Gate B harness. |

## Local proof (uncommitted on `8678fab4` + merge index)

| Command | Result |
| --- | --- |
| `node scripts/test_vacation_app_865_chrome.mjs` | PASS |
| `node scripts/test_ui_877_pic_popup_media_strip.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (429 offline) |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (rebake sha above) |
| `node scripts/test_shared_trip_spa_console.mjs` | PASS (header mic absent; no 404 on pic-popup viewer) |
| `node scripts/check-no-comments.mjs` | **SKIP** — `apps/vacation-client/node_modules/typescript` missing in lane worktree |
| `node scripts/test_keepsake_style2.mjs` | **SKIP** — root `qrcode` package missing in lane worktree; `Record voice note` present in `ts-shared-audio-recorder.js` |
| `BASE=vk node scripts/check-code-ratchet.mjs` | Host pre-push |
| `node scripts/test_served_page_layout.mjs` | Host Gate B structure (Chrome) |

## Host publish (merge commit)

Complete merge: `git add` resolved `J/RECEIPT.md` + rebaked bundle + harness rows; `git commit --no-edit`; push once to `vkfill/865-20261109101932`. Run full pre-DONE gates on host with `node_modules` installed.

Evidence (#877): `/home/ubishere9995/tsv-work/vkfill-877-20261109114313-job/877-statue-{before,open,fullscreen,after}-{390,1280}.png`

## Out of scope (left alone)

Baselines, `screen_probe.mjs`, NYC 8CQX trip data, `package.json` / deps install in lane sandbox.
