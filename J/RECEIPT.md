# VK PR #590 / issue #588 receipt (cursor-ubuntu vkfill-590 BASE-MERGE)

**Branch:** `vkfill/588-20261021125728`  
**Start head:** `6e029f24ddc3314c2f62f7af97774944af557a6d`  
**Tip head:** `27c0ea8a`  
**Authority:** GBrain `bot-admin/lanes/vk-pr-handoff/pr-590` + chief-dr dirty-head merge brief

## Base merge

Host merged `origin/migrate/trek-source` at `446e19137ebe9c6ee0dab651dca078f2cd35f13f` into `bf232ddd`. Conflicts resolved in `J/` only; took base `public/assets/index-BKun7ofk.js` then `node scripts/rebake_served_trek_bundle.mjs`; kept base `src/vacation/shared-trip-oe-list-row-patch.mjs` (`<strong>` default list-row title for Gate B `first_text`).

Second dirty-head merge: merged `origin/migrate/trek-source` at `e3364ac5b3d44795cd3b2d9c857e9c940a9f6790` into `6e029f24` (PR #600 / #597 Gate B NYC fixture on base). Conflicts resolved in `J/RECEIPT.md` only; `node scripts/rebake_served_trek_bundle.mjs` (no served bundle diff).

## Change (PR #588)

- `src/vacation/shared-trip-fixture-replay.mjs`: served `places` shape unchanged on replay (CI fix for `test_same_selection_capture.py`).
- `apps/vacation-client/src/lib/listTabModel.mjs`: generic list logos at render time via `resolveThingLogoUrl`.

## Local verification

| Command | Result |
| --- | --- |
| `python3 scripts/ops/dispatch/test_same_selection_capture.py` | OK (11 tests) |
| `cd apps/vacation-client && npm test` | OK (layout shell skipped without CHROME_PATH) |
| `node scripts/rebake_served_trek_bundle.mjs` | OK |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/run-offline-tests.mjs` | FAIL lane host: `test_day_by_day_map_marker_bounds_chrome.mjs` hardcodes `/usr/bin/google-chrome-stable` (missing on Ubuntu lane; not PR diff) |

## Verdict

Base-merge tip `27c0ea8a` ready for host push; CI `unit-tests` + Gate B on pushed head are merge authority.
