# PR 660 vkfill-660 source round (remove hotels catalog dedupe)

Start HEAD `efaadd94fc78e670d2b5b63c45627e622651ed1f` (verified before edit). Host publication only — no commit in lane.

## Change

Per `bot-admin/lanes/vk-pr-handoff/pr-660` (dr eggbot 2026-10-23 6:05 AM PT): removed `applyHotelsTabCatalogDedupePatch` and its `trek-style2-bundle.mjs` call so Hotels tab restores upstream double catalog rows (logo + day chip lists). Budget/flights/hydrate patches untouched.

## Uncommitted files (host commit)

- `src/vacation/trek-vk-price-coverage-patches.mjs` — delete dedupe patch export
- `src/vacation/trek-style2-bundle.mjs` — drop import/call
- `scripts/test_nyc_vk_budget_list_price_coverage.mjs` — assert upstream `kn=ze.length?Po.filter…` anchor instead of `tsScore` dedupe
- `public/assets/index-BKun7ofk.js` — rebaked

## Checks

| Check | Result | Reference |
| --- | --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | ok | sha256=`5677e1de3706984347204d9bc8e5440d9b66323b35189d092475164e4e3ecc31` |
| `node scripts/test_nyc_vk_budget_list_price_coverage.mjs` | pass | local run |
| `node scripts/test_served_trek_bundle.mjs` | pass | local run |
| `~/tsv-dispatch/bin/vk-live-row-check.sh` worktree 660 | ROWCHECK-PASS | `/tmp/vk660-row-check/rowcheck.json` verdict PASS, `failing: []` (hotels-390/1280 + tops included) |
| `node scripts/check-no-comments.mjs` | pass | local run |
| `node scripts/test_offline_manifest.mjs` | pass | local run |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass | 0 fail |
| `node scripts/run-offline-tests.mjs` | **stop** | `scripts/test_day_by_day_map_marker_bounds_chrome.mjs` — Chrome not at `/usr/bin/google-chrome-stable` (env, not this diff) |

CI green + Gate B on host-pushed head remain required for merge (`efaadd94` baseline).
