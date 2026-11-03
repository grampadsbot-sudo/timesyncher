Closes #547

## What changed

Re-arm 2026-11-02: merged base `vk` at **6e88120** into PR #550 (start **f5a45b2c**); kept #547 row layout (description inline on the name line at every width including 390px).

1. **`src/vacation/shared-trip-oe-list-row-patch.mjs`**: inline `data-list-summary` flex beside `data-ts-list-row-name` (no `tsRowInlineDesc` / stacked mobile block); hotel `je()` inline-flex with `data-ts-hotel-row-head`; inherits vk events tab anchor + logo-pair nowrap rewind in `patchSharedTripListWrapping`.
2. **`public/assets/index-BKun7ofk.js`**: took base served bundle then rebaked via `node scripts/rebake_served_trek_bundle.mjs`.
3. **`scripts/test_shared_tab_list_summary.mjs`**: asserts inline summary + logo-pair nowrap; rejects stacked `marginTop:6` mobile summary path.

## Verification (local)

| Command | Result |
|---|---|
| `node scripts/rebake_served_trek_bundle.mjs` | run on merge resolution |
| `node scripts/test_shared_tab_list_summary.mjs` | run on merge resolution |
| `node scripts/test_served_trek_bundle.mjs` | run on merge resolution |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | run on merge resolution |
| `node scripts/check-no-comments.mjs` | run on merge resolution |
| `BASE=vk node scripts/check-code-ratchet.mjs` | run on merge resolution |

Gate B structure (`row layout: description on the name line, fills the row`) and CI green on pushed head are authority (host cron).

## Feature parity (2026-11-02, start **a163889a**)

Gate B round 14: `feature lost vs staging` — missing header controls `Remove 🚗 Dollar JFK` (and sibling car brands). Cause: `public/ts-car-brand-filter.js` `carRows()` skipped new `li[data-list-row][data-thing-category="car"]` rows (long inline-desc `innerText` > 80 chars). Patched script to target list-row car markers, read name from `[data-ts-list-row-name="1"]`, expose `Remove 🚗 {brand}` (+ aria-label), and remount on DOM updates. Row layout / bundle unchanged.

Checks: `node scripts/test_real_app_entry.mjs`, `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`, `cd apps/vacation-client && npm test` — all exit 0 locally.

## Scope / left alone

Description substance (#549), prices (#580), baselines, Gate B thresholds, fixtures, workflows, dependencies.
