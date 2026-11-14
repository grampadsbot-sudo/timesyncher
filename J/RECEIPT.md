# PR #985 / issue #980 — base merge + CI unit-tests (cursor-ubuntu, composer-2.5)

**Start HEAD:** `df3a759891bad7568ca8b27d051af386e8d09c25` (verified `git rev-parse HEAD`)  
**Outcome:** `source-ready` for host publication (merge commit + push on `vkfill/980-20261113111627`).

**Base merge:** host merged `origin/vk` at `995df4eeadeb21d28a592dfc99e4a3529205a193` into start HEAD; conflicts resolved in `J/RECEIPT.md`, `scripts/offline-tests.txt` (union: #980 `test_thing_travel_total_price.mjs` + vk #988/#989 acceptance offline entries).

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-985` — page not found on fetch; noted here per lane brief.

Rule: `bot-admin/decisions/vk-hotels-cars-list-total-price-20261113` — Thing Price and Budget use the same estimated hotel total (rate × nights × 1.2).

## CI fix (prior rounds on branch; unchanged at merge)

**Root cause:** Hotel/car budget sync uses `thingTravelTotalPrice` (**$480** = $100/night × 4 × 1.2) per ruling #76; BUD fixture had asserted **400** and trip scrape total **$500**.

**Fix:** Align Maui hotel fixture expectations to **480** / **$580** trip planned (480+45+55), same as `scripts/test_728_budget_data.mjs`.

## Merge resolution (uncommitted — host commits)

| Path | Role |
| --- | --- |
| `scripts/offline-tests.txt` | Union offline manifest: PR `test_thing_travel_total_price.mjs` + vk acceptance 988/989 scripts |
| `J/RECEIPT.md` | This receipt + base-merge note |
| `J/PR_DESCRIPTION.md` | Restored #985 text + base-merge note (vk merge had overwrote with #991 copy) |
| `public/assets/index-BKun7ofk.js` | vk base taken by host; rebake applied below |

## Local checks (start HEAD `df3a7598`, dirty merge tree)

| Check | Result |
| --- | --- |
| `npm ci` (repo root) | exit 0 |
| `node scripts/rebake_served_trek_bundle.mjs` | exit 0 sha256=`39bb37ac81e49a043d2af7f5cf828d6724cac4e50f4f7a52646c9ed662f7e3db` |
| `cd apps/vacation-client && npm test` | exit 0 |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | exit 0 |
| `node scripts/test_thing_travel_total_price.mjs` | exit 0 |
| `node scripts/test_728_budget_data.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 (470 offline) |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 (0 fail) |
| `node scripts/test_acceptance_988_no_summary_details_fallback.mjs` | exit 0 (pin `22834db13…` after vk #988 essence-ladder merge; was `aa75c85a…` stale) — head `a19b9cdd5d1e165150a3a448fc4c44bfe2389c3d` |

No commit, stage, push, merge, rebase, or deploy in this lane (HOST PUBLICATION ONLY).

## Uncommitted paths (host stages)

All merge-index changes plus conflict resolutions above and rebake on `public/assets/index-BKun7ofk.js`.

**Do not stage (collateral):** `evidence/vacation-client-p2-*/*.png` updated by `apps/vacation-client` npm test harness (unless host intentionally refreshes evidence).

## Host next

Resolve receipt check table with post-run results; `git add` conflict resolutions; `git commit --no-edit` merge; push `vkfill/980-20261113111627` once; wait CI green on new head.