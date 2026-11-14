# PR #985 / issue #980 — CI unit-tests (cursor-ubuntu, composer-2.5)

Outcome: **source-ready** from starting HEAD `3aac737913abf8e7dcc50025e3b3fd6e055fc27c` (branch `vkfill/980-20261113111627`).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-985`: **page_not_found** on this pass.

## Conflicts resolved

| File | Resolution |
| --- | --- |
| `src/vacation/list-row-dates.mjs` | Kept PR #980 list total (`tsThingTravelTotalLabel`) on hotel/car rows |
| `scripts/offline-tests.txt` | Union: `test_acceptance_980_hotel_car_totals`, `test_thing_travel_total_price`, `test_acceptance_984_add_place_latency` |
| `public/assets/index-BKun7ofk.js` | Took vk base via `git show origin/vk:…`, then `node scripts/rebake_served_trek_bundle.mjs` |

## CI fix (`test_shared_hotels_390_text_wrap.mjs`)

**Root cause:** List renderer `Oe` (served bundle) calls `tsThingTravelTotalLabel(G,la,cn)` on hotel/car rows after PR #980; `scripts/test_shared_hotels_390_text_wrap.mjs` puppeteer `Function` eval supplies stubs for `ie`/`la` but not `tsThingTravelTotalLabel` or `cn` → `ReferenceError` on CI head `3aac7379`.

**Fix:** `scripts/test_shared_hotels_390_text_wrap.mjs` — add `cn: []` and `tsThingTravelTotalLabel` stub (same pattern as `scripts/test_shared_tab_list_summary.mjs`) so isolated eval matches #980 list price wiring without weakening layout assertions.

## Changed files (uncommitted; host publishes)

| File | Why |
| --- | --- |
| `scripts/test_shared_hotels_390_text_wrap.mjs` | Puppeteer eval stubs for #980 total label |

## Local checks (starting HEAD `3aac737913abf8e7dcc50025e3b3fd6e055fc27c`)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | exit 0 |

No commit, stage, push, merge, rebase, or deploy (HOST PUBLICATION ONLY).
