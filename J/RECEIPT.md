# VK PR #581 receipt (cursor-ubuntu vkfill-581 conflict-resolution round 2)

**Start sha:** `500202d80fcecbe0df955fba5c5fe484616ce1e1`  
**Tip sha:** `b4caf0a5` (merge on `500202d8`; base merge `c1b7b286`; receipt doc commit on branch tip)

## Handoff

GBrain `bot-admin/lanes/vk-pr-handoff/pr-581` (chief dr 11:50 AM PT 10/21): host-started merge of `origin/migrate/trek-source` (`c1b7b286`); resolve `J/RECEIPT.md` and `J/PR_DESCRIPTION.md` only.

## Product (#579)

Day-by-day map markers: 30×30 shell, 26×26 `object-fit:contain` img. Map pins use **`data-ts-map-marker-logo` only**. Patch in `src/vacation/trek-live-product-patches.mjs`; rebaked `public/assets/index-BKun7ofk.js`.

## This round

Host-started merge completed: kept #581 receipt and PR description; dropped base #585 doc text. No product, bundle, test, or checker edits. `git commit --no-edit` completes merge on `500202d8`.

| Command | Exit |
| --- | --- |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_day_by_day_map_marker_bounds_chrome.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Offline manifest (host)

`scripts/offline-tests.txt` in order with `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`: lines through `scripts/test_day_by_day_map_marker_bounds_chrome.mjs` pass; stops at `scripts/test_live_transcript_dialog_pdf.mjs` (`rules.via` `gbrain-cli-get_page` vs `bundled-get_page`; host env, not introduced by this merge).

## Verdict

Merge conflict resolved in docs only on `b4caf0a5`; pre-DONE gates pass; host publishes branch tip; CI + Gate B (allowance #579) on new tip.
