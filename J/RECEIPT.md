# PR #826 / #825 — Cursor lane receipt (chief-dr car-title test contract)

Result: **source-ready**, uncommitted patch for host publication. Starting HEAD: `5a61b9655d0bd8830cbb8e8dad632044dacc9a9e` (unchanged; no commit in lane). Branch: `vkfill/825-20261105070213`. Model: composer-2.5 (cursor-ubuntu). No OpenRouter or paid fallback.

## Change (authorized test-only)

Chief-dr ruling 2026-11-05 11:08 AM PT (GH comment 6666790350): full stored Thing name via `mr(G)` in car list rows (`shared-trip-oe-list-row-patch.mjs` on head `5a61b965`); do **not** revert to company-only `J(G)||"Rental"`.

Updated served-bundle contract in `scripts/test_gate_b_product_row_fields.mjs` line 205:

- **Before:** `assert.match(bundle, /children:n\.jsx\("strong",\{children:J\(G\)\|\|"Rental"\}\)/);`
- **After:** `assert.match(bundle, /children:n\.jsx\("strong",\{children:mr\(G\)\}\)/);`

All other assertions in that file unchanged. No product, fixture, checker, baseline, workflow, or served-asset edits.

## Local verification (starting HEAD `5a61b965`)

| Command | Result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | exit 0 |
| `node scripts/test_budget_timeline_only_rows.mjs` | exit 0 |
| `node scripts/test_budget_itinerary_timeline_selected.mjs` | exit 0 |
| `node scripts/test_shared_tab_list_summary.mjs` | exit 0 |
| `cd apps/vacation-client && npm test` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `git diff --check` | exit 0 |

Uncommitted diff: one file, `scripts/test_gate_b_product_row_fields.mjs` (1 line). Accidental `evidence/` PNG churn from client tests was restored to HEAD before DONE.

## Not done in lane (host / chief-dr)

- No commit, push, or PR head move — HOST PUBLICATION ONLY.
- CI on a **new** head not run here; prior CI failure on `5a61b965` was exactly this test assertion (job `127372173516`, `test_gate_b_product_row_fields.mjs:205`).
- Gate B structure mode on `5a61b965` remains FAIL for intentional #825 look; chief-dr will `approved-new-look` after CI green — do not revert product for pixels.

## Scope left alone

Gate B checker, baselines, `scripts/offline-tests.txt`, workflows, rebake, budget row 603 product chase, #827.
