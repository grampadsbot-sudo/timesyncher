# PR #826 / #825 — Cursor lane receipt (#728 budget fixture timeline-only)

Result: **source-ready**, uncommitted patch for host publication. Starting HEAD: `d8169910f3291c57574592e307b5d03846e4624b` (unchanged; no commit in lane). Branch: `vkfill/825-20261105070213`. Model: composer-2.5 (cursor-ubuntu). Chief-dr ruling: bot-admin/lanes/vk-pr-handoff/pr-826 (9:16 PM PT 2026-11-05).

## Change

GitHub unit-tests on head `d8169910` failed at `scripts/test_728_budget_data.mjs:50`: `buildBudgetModel(served).rows` was `[]` because `budgetItineraryPlaces` uses `buildDayTimeline`, which requires `thingOverrides['place:N'].timeline === true`. The #728 mini-trip fixture had timeline-selected places only via assignments/dayIds without `timeline: true`.

**Fix (test/fixture only):** update ONLY `scripts/test_728_budget_data.mjs`:

- Set `timeline: true` on `thingOverrides` for `place:1`, `place:3`, and `place:5`.
- Add `{ place_id: 3 }` to `assignments[10]` (place 3 was dayIds-only; timeline builder does not scan dayIds).
- Adjust expected `buildBudgetModel` row order to live assignment order `[1, 3, 5]` (was `[1, 5, 3]`).

All price asserts, API place budget lines `[1, 3, 5]`, and idempotency asserts unchanged. No product budget algorithm changes.

**Files (uncommitted):**

- `scripts/test_728_budget_data.mjs`

Prior branch fixes unchanged: product_row_fields `mr(G)`, filter_chips, `data-ts-list-desc`, ui_754 two-arg `tsItinLine`.

## Local verification (starting HEAD `d8169910`)

| Command | Result |
| --- | --- |
| `node scripts/test_728_budget_data.mjs` | exit 0 |
| `node scripts/test_ui_754_punchlist.mjs` | exit 0 |
| `node scripts/test_hotel_list_desc_capture_leaf.mjs` | exit 0 |
| `node scripts/test_ui_734_round2_punchlist.mjs` | exit 0 |
| `node scripts/test_shared_tab_filter_chips.mjs` | exit 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | exit 0 |
| `node scripts/test_budget_timeline_only_rows.mjs` | exit 0 |
| `node scripts/test_budget_required_price_completeness.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `git diff --check` | exit 0 |

## Not done in lane (host)

- No commit, push, or PR head move — HOST PUBLICATION ONLY.
- GitHub CI / Gate B not run on a new head here.

## Scope left alone

Product `budgetItineraryPlaces` / `buildDayTimeline`, Gate B pixel/overflow/price noise, baselines, checkers, workflows, #827, deploy.
