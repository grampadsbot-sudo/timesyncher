# VK PR #581 receipt (cursor-ubuntu vkfill-581 conflict-resolution)

**Start sha:** `239c265983d652b534e5101eaa6f790efe9182bd`  
**Tip sha:** `120b0afc` (merge `9fa1d339` + docs; base merge `153c1900`)

## Handoff

GBrain `bot-admin/lanes/vk-pr-handoff/pr-581` (chief dr 11:35 AM PT 10/21): merge base into PR branch; resolve `J/RECEIPT.md` + served bundle only.

## Product (#579)

Day-by-day map markers: 30×30 shell, 26×26 `object-fit:contain` img. Map pins use **`data-ts-map-marker-logo` only**. Patch in `src/vacation/trek-live-product-patches.mjs`; rebaked `public/assets/index-BKun7ofk.js` (sha256 `f659963bf9cd3f91d35670625d08e96d5df1a00230629c6c4a71312e701f50db`).

## This round

Host-started merge completed: kept #581 receipt; bundle = base `index-BKun7ofk.js` + `node scripts/rebake_served_trek_bundle.mjs`. `git commit --no-edit` → `9fa1d339`.

## Commands (exit codes)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_day_by_day_map_marker_bounds_chrome.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Offline manifest (host)

`scripts/offline-tests.txt` lines 1–44 and 45–91 passed locally after `npm ci` (+ `apps/vacation-client/npm ci`). Stopped at `scripts/test_live_transcript_dialog_pdf.mjs`: `rules.via` was `gbrain-cli-get_page` (host has `gbrain` in PATH; CI expects `bundled-get_page`). Full manifest not re-run on host; CI unit-tests job runs `node scripts/run-offline-tests.mjs` with `python3-reportlab` (`.github/workflows/evidence-secrets.yml`).

## Verdict

Merge conflict resolved; pre-DONE gates + #579 bundle tests pass on `9fa1d339`. Host publishes; CI + Gate B on new head.
