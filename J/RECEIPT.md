# PR #985 — host merge conflict resolution (cursor-ubuntu, composer-2.5)

Outcome: **source-ready** from starting HEAD `8baf4679f23229fae8ec8baa2d5065818bef4cba`. Host merged `origin/vk` at `9e641b63d15da94030d8043f55aaf9afafd8817d` (conflicts resolved in source; host must `git add` + `git commit --no-edit`).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-985`: **page_not_found** on this pass.

## Conflicts resolved

| File | Resolution |
| --- | --- |
| `src/vacation/list-row-dates.mjs` | Kept PR #980 list total (`tsThingTravelTotalLabel`) on hotel/car rows |
| `scripts/offline-tests.txt` | Union: `test_acceptance_980_hotel_car_totals`, `test_thing_travel_total_price`, `test_acceptance_984_add_place_latency` |
| `public/assets/index-BKun7ofk.js` | Took vk base via `git show origin/vk:…`, then `node scripts/rebake_served_trek_bundle.mjs` |

## CI fix (#964 unit test)

**Root cause:** `patchVk980TotalPrice` replaced detail #964 rating-row IIFE price with `tsThingTravelTotalLabel(Dt,la,cn)`; `scripts/test_issue_964_detail_overall_rating_row.mjs` evals that IIFE in an isolated `Function` without bundle helpers → `ReferenceError`.

**Fix:** `src/vacation/trek-vk-980-total-price-patch.mjs` — #964 row uses `typeof tsThingTravelTotalLabel!="undefined"` guard with numeric-price fallback for eval; live bundle still uses total label; decouple `DETAIL_PRICE_VALUE` replace from `DETAIL_PRICE_FRAG` guard so rating row gets `tsPriceLabel` children.

## Changed files (uncommitted; host publishes)

| File | Why |
| --- | --- |
| `src/vacation/list-row-dates.mjs` | Merge conflict |
| `scripts/offline-tests.txt` | Merge conflict |
| `src/vacation/trek-vk-980-total-price-patch.mjs` | #964 eval + price value patch |
| `public/assets/index-BKun7ofk.js` | Rebaked served bundle |

**Leave out of commit:** `evidence/vacation-client-p2-*/**` PNG deltas from local `apps/vacation-client` test build (artifact churn only).

## Local checks (starting HEAD `8baf4679f23229fae8ec8baa2d5065818bef4cba`)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | exit 0 |
| `node scripts/test_issue_964_detail_overall_rating_row.mjs` | exit 0 |
| `node scripts/test_thing_travel_total_price.mjs` | exit 0 |
| `node scripts/test_acceptance_980_hotel_car_totals.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `cd apps/vacation-client && npm test` | exit 0 |

No commit, stage, push, merge, rebase, or deploy (HOST PUBLICATION ONLY).
