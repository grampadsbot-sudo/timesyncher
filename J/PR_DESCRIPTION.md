Closes #547

## What changed

Re-arm 2026-11-02: merged base `vk` at **ebaaa74e** into PR #550; kept #547 row layout (description inline on the name line at every width including 390px).

1. **`src/vacation/shared-trip-oe-list-row-patch.mjs`**: inline `data-list-summary` flex beside `data-ts-list-row-name` (no `tsRowInlineDesc` / stacked mobile block); hotel `je()` inline-flex with `data-ts-hotel-row-head`; inherits vk events tab anchor + logo-pair nowrap rewind in `patchSharedTripListWrapping`.
2. **`public/assets/index-BKun7ofk.js`**: rebaked via `node scripts/rebake_served_trek_bundle.mjs`.
3. **`scripts/test_shared_tab_list_summary.mjs`**: asserts inline summary + logo-pair nowrap; rejects stacked `marginTop:6` mobile summary path.

## Verification (local)

| Command | Result |
|---|---|
| `node scripts/rebake_served_trek_bundle.mjs` | run on push head |
| `node scripts/test_shared_tab_list_summary.mjs` | run on push head |
| `node scripts/test_served_trek_bundle.mjs` | run on push head |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | run on push head |
| `node scripts/check-no-comments.mjs` | run on push head |
| `BASE=vk node scripts/check-code-ratchet.mjs` | run on push head |

Gate B structure (`row layout: description on the name line, fills the row`) and CI green on pushed head are authority (host cron).

## Scope / left alone

Description substance (#549), prices (#580), baselines, Gate B thresholds, fixtures, workflows, dependencies.
