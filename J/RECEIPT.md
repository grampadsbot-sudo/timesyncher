# VK PR #581 receipt (cursor-ubuntu vkfill-581 conflict-resolution round 2)

**Start sha:** `500202d80fcecbe0df955fba5c5fe484616ce1e1`  
**Tip sha:** (set after merge commit; base merge `c1b7b286`)

## Handoff

GBrain `bot-admin/lanes/vk-pr-handoff/pr-581` (chief dr 11:50 AM PT 10/21): host-started merge of `origin/migrate/trek-source` (`c1b7b286`); resolve `J/RECEIPT.md` and `J/PR_DESCRIPTION.md` only.

## Product (#579)

Day-by-day map markers: 30×30 shell, 26×26 `object-fit:contain` img. Map pins use **`data-ts-map-marker-logo` only**. Patch in `src/vacation/trek-live-product-patches.mjs`; rebaked `public/assets/index-BKun7ofk.js`.

## This round

Host-started merge completed: kept #581 receipt and PR description; dropped base #585 doc text. No product, bundle, test, or checker edits. `git commit --no-edit` completes merge on `500202d8`.

| Command | Exit |
| --- | --- |
| `node scripts/test_served_trek_bundle.mjs` | (run) |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_day_by_day_map_marker_bounds_chrome.mjs` | (run) |
| `node scripts/check-no-comments.mjs` | (run) |
| `node scripts/test_offline_manifest.mjs` | (run) |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | (run) |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | (run) |

## Offline manifest (host)

`scripts/offline-tests.txt` in order per brief. Stopped at `scripts/test_live_transcript_dialog_pdf.mjs` if `rules.via` is `gbrain-cli-get_page` (host env; CI uses bundled rules).

## Verdict

Merge conflict resolved in docs only; host publishes new head; CI + Gate B (allowance #579) on new tip.
