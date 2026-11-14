# PR #985 / issue #980 — CI unit-tests (cursor-ubuntu, composer-2.5)

Outcome: **source-ready** from starting HEAD `bdf0f3c5532f6ba117335b2bf20148005e8cfb62` (branch `vkfill/980-20261113111627`).

Rule: `bot-admin/decisions/vk-hotels-cars-list-total-price-20261113` — Thing Price and Budget use the same estimated hotel total (rate × nights × 1.2).

## CI fix (`apps/vacation-client/test/budget.unit.mjs`)

**Root cause:** `thingBudgetAmount` called `thingTravelTotalPrice` (correct `$1,867` = 389 × 4 × 1.2) but, when `stayDays` was set on the override, replaced `amount` with `nightly × stayDays` without the 20% estimate markup → **1556 ≠ 1867** on CI head `bdf0f3c5`.

**Fix:** `src/vacation/thing-price.mjs` — return `total.amount` from `thingTravelTotalPrice` for hotel/car budget lines (no stay-day recompute).

**Fixture alignment:** `scripts/test_728_budget_data.mjs` — hotel `$100/night` × 4 nights expects **480** (with estimate markup), not 400.

## Changed files (uncommitted; host publishes)

| File | Why |
| --- | --- |
| `src/vacation/thing-price.mjs` | Budget hotel/car amounts match list total-price helper |
| `scripts/test_728_budget_data.mjs` | 728 matrix matches 20% hotel estimate total |

## Local checks (starting HEAD `bdf0f3c5532f6ba117335b2bf20148005e8cfb62`)

| Command | Result |
| --- | --- |
| `node apps/vacation-client/test/budget.unit.mjs` | exit 0 |

No commit, stage, push, merge, rebase, or deploy (HOST PUBLICATION ONLY).