# VK PR #581 receipt (cursor-ubuntu vkfill-581 conflict-resolution)

**Start sha:** `239c265983d652b534e5101eaa6f790efe9182bd`  
**Merge base:** `migrate/trek-source` (`153c1900` at dispatch)

## Handoff

GBrain `bot-admin/lanes/vk-pr-handoff/pr-581` (chief dr 11:35 AM PT 10/21): merge `origin/migrate/trek-source` into PR branch; resolve `J/RECEIPT.md` + served bundle only.

## Product (#579)

Day-by-day map markers: 30×30 shell, 26×26 `object-fit:contain` img. Map pins use **`data-ts-map-marker-logo` only** (no `data-ts-logo-chip` on map markers). Patch in `src/vacation/trek-live-product-patches.mjs`; rebaked `public/assets/index-BKun7ofk.js` after taking base bundle + `node scripts/rebake_served_trek_bundle.mjs`.

## This round

Host-started `git merge --no-ff --no-commit origin/migrate/trek-source`. Resolved conflicts: kept this receipt (dropped base #584 receipt text); bundle = base `index-BKun7ofk.js` then rebake (sha256 `f659963bf9cd3f91d35670625d08e96d5df1a00230629c6c4a71312e701f50db`). Completed merge with `git commit --no-edit`.

## Commands (exit codes)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | (see tip run) |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_day_by_day_map_marker_bounds_chrome.mjs` | (see tip run) |
| `node scripts/check-no-comments.mjs` | (see tip run) |
| `node scripts/test_offline_manifest.mjs` | (see tip run) |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | (see tip run) |
| offline-tests.txt full manifest | (see tip run) |

## Verdict

Pending offline manifest + CI on merge tip (host publishes).
