# TSV #969 / PR #971 — base merge + lane receipt (composer-2.5)

**Starting HEAD:** `a02980f1b723f7d4e36443ad0ec608ebc0832914` (verified `git rev-parse HEAD` before edit)

**Base merge:** Integrated `origin/vk` at `71daee4f9d909836f02c47566ff910a3eadcb5ac` into branch worktree (no `git merge` in lane; host publishes merge commit).

## Conflict resolution (keep #969 + vk)

| Path | Resolution |
| --- | --- |
| `src/vacation/trek-style2-bundle.mjs` | #969 `patchThingDetailV3` + `patchDetailSubstanceHarness` chain; vk `patchVk980TotalPrice` before `patchListRowDates`. |
| `src/vacation/trek-live-product-patches.mjs` | vk `patchSharedTripBootFetch` (989 boot fetch). |
| `src/vacation/list-row-dates.mjs`, `shared-trip-live-app-fields.mjs` | vk ruling #76 total-price list rows. |
| `scripts/offline-tests.txt` | vk manifest (includes #980/#988/#989 offline tests). |
| `scripts/test_shared_tab_list_summary.mjs` | vk total-price assertions + `patchVk980TotalPrice` in test harness. |
| `public/assets/index-BKun7ofk.js` | `node scripts/rebake_served_trek_bundle.mjs` after patch union. |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | Kept from #969 (absent on vk). |

## Local verification (uncommitted; host commit required)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | pass |
| `node scripts/test_issue_959_owner_pencil_webkit.mjs` + `acceptance/969.json` | pass |
| `cd apps/vacation-client && npm test` | pass |
| `node scripts/test_shared_tab_list_summary.mjs` | pass |
| `node scripts/test_thing_travel_total_price.mjs` | pass |
| `npm run test:keepsake-style2` | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |

No git stage/commit/push in lane — host publication only.