# PR #826 / #825 — Cursor lane receipt (CI filter-chips + budget contract)

Result: **source-ready**, uncommitted patch for host publication. Starting HEAD: `b130705ebf8ecd90142542ee10714f2b4e4b6522` (unchanged; no commit in lane). Branch: `vkfill/825-20261105070213`. Model: composer-2.5 (cursor-ubuntu). No OpenRouter or paid fallback.

## Change

Live CI on head `b130705e` failed unit-tests at `scripts/test_shared_tab_filter_chips.mjs:68`: assertion required legacy budget source `(Ut||[]).filter(wn=>wn&&wn.place_id)` in the served bundle. Product on this head already builds budget rows from day timeline via `Qa.flatMap(di=>Ci(di))` (same contract as `scripts/test_thing_card_ui_keep.mjs` lines 32–36).

Updated `scripts/test_shared_tab_filter_chips.mjs` line 68:

- **Before:** `assert.match(bundle, /\(Ut\|\|\[\]\)\.filter\(wn=>wn&&wn\.place_id\)/);`
- **After:** `assert.doesNotMatch(bundle, /\(Ut\|\|\[\]\)\.filter\(wn=>wn&&wn\.place_id\)/);`

No product, fixture, checker, baseline, workflow, or served-asset edits. Prior head `b130705e` already carries chief-dr car-title contract (`mr(G)`) in `scripts/test_gate_b_product_row_fields.mjs:205`.

## Local verification (starting HEAD `b130705e`)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_tab_filter_chips.mjs` | exit 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | exit 0 |
| `node scripts/test_budget_timeline_only_rows.mjs` | exit 0 |
| `node scripts/test_budget_itinerary_timeline_selected.mjs` | exit 0 |
| `node scripts/test_shared_tab_list_summary.mjs` | exit 0 |
| `cd apps/vacation-client && npm test` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `git diff --check` | exit 0 |

Uncommitted diff: one file, `scripts/test_shared_tab_filter_chips.mjs` (1 line). Accidental `evidence/` PNG churn from client tests restored to HEAD before DONE.

## Not done in lane (host / chief-dr)

- No commit, push, or PR head move — HOST PUBLICATION ONLY.
- CI on a **new** head not run here; prior CI failure reference: head `b130705e`, `scripts/test_shared_tab_filter_chips.mjs:68` (job brief live CI read 2026-11-05 6:48 PM PT).
- Gate B structure mode remains for intentional #825 look after CI green — do not revert product for pixels.

## Scope left alone

Gate B checker, baselines, `scripts/offline-tests.txt`, workflows, rebake, budget row 603 product chase if still present on staging, #827.
