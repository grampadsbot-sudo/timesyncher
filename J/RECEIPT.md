# PR #985 / issue #980 — CI unit-tests (cursor-ubuntu, composer-2.5)

Outcome: **source-ready** from starting HEAD `a8c628c520fe4da135183656b07f275eee31b7fc` (branch `vkfill/980-20261113111627`).

Rule: `bot-admin/decisions/vk-hotels-cars-list-total-price-20261113` — Thing Price and Budget use the same estimated hotel total (rate × nights × 1.2).

## CI fix (`scripts/test_shared_trip_api_budget_lines.mjs`)

**Root cause:** Hotel/car budget sync on head `a8c628c5` uses `thingTravelTotalPrice` ( **$480** = $100/night × 4 × 1.2 ) per ruling #76, but this BUD fixture still asserted **400** and trip scrape total **$500**.

**Fix:** Align Maui hotel fixture expectations to **480** / **$580** trip planned (480+45+55), same as `scripts/test_728_budget_data.mjs`.

## Changed files (uncommitted; host publishes)

| File | Why |
| --- | --- |
| `scripts/test_shared_trip_api_budget_lines.mjs` | API budget + BUD scrape amounts match 20% hotel estimate |

## Local checks (starting HEAD `a8c628c520fe4da135183656b07f275eee31b7fc`)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | exit 0 |
| `node scripts/test_thing_travel_total_price.mjs` | exit 0 |
| `node scripts/test_728_budget_data.mjs` | exit 0 |

No commit, stage, push, merge, rebase, or deploy (HOST PUBLICATION ONLY).