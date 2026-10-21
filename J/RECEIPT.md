# VK PR #581 receipt (cursor-ubuntu vkfill-581-20261021093733)

**Start sha:** `dab52f74ec017619a51b194339130adeef825fb9`  
**Tip sha:** `ef7ace93` (local; host publishes after DONE)

## Handoff

GBrain `bot-admin/lanes/vk-pr-handoff/pr-581`: **not found** (`gbrain get` → page_not_found).

## Product (#579)

Map marker patch: 30×30 shell, 26×26 `object-fit:contain` img (`dab52f74`). This lane adds **`data-ts-map-marker-logo` only** on day-by-day pins (drops `data-ts-logo-chip` on map markers so capture `ICON_SEL` does not score pins as list-row chips). Rebaked `public/assets/index-BKun7ofk.js`.

## Blocker (Done means / Gate B)

Ubuntu Gate B structure mode still **cannot run** on this host: `~/tsv-gateb/restore-check-logo-centres.mjs` imports `./lib/row-name-frame.mjs` but **`/home/ubishere9995/tsv-gateb/lib/row-name-frame.mjs` is missing** (only `gate-b-shell-layout-checker.mjs` present under `lib/`). Lane scope bans editing Gate B / capture scripts and work is limited to this worktree — **cannot repair host `~/tsv-gateb/` here**. Reference copy exists on branch `dr/logo-good-enough-20261019` at `scripts/ops/gateb/lib/row-name-frame.mjs` for host publication sync.

Until host restores that file, **32/32 Gate B and PR “done means” are blocked** despite the map-marker UI fix.

## Commands (exit codes)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/test_shared_tab_category_css_blast_radius.mjs` | 0 |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_day_by_day_map_marker_bounds_chrome.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

**Blocked on host Gate B harness** (`row-name-frame.mjs` publication gap). Product commit ready for host push; managing dr must restore `~/tsv-gateb/lib/row-name-frame.mjs` (or equivalent sync) before Gate B / CI `gateb` can pass on this change.
