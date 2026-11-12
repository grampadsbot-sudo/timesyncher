# TSV #971 (PR #969 / #971) — lane receipt

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971` — **not found** (page_not_found on this pass).

**Lane:** cursor-ubuntu / composer-2.5 only · HOST PUBLICATION ONLY  
**Starting HEAD:** `a6618e0c3f2f2ed5f666e751658091e337a40863` (verified before edit)

## Root cause (CI)

`patchThingDetailV3` (#969) replaced the legacy detail body and dropped the edit-mode platform rating grid that `patchStarRatings` had injected (`data-ts-detail-rating-stars`). That broke `scripts/test_served_star_rating_bundle.mjs` on CI head `a6618e0c`.

## Change (uncommitted)

`src/vacation/trek-thing-detail-v3-patch.mjs`:

- Restore edit-mode Google/Yelp/other rating editors inside `detailBodyV3` with `data-ts-detail-rating-stars`, star HTML via `stars()`, and hidden inputs wired through `write()`.

Rebaked `public/assets/index-BKun7ofk.js` with `node scripts/rebake_served_trek_bundle.mjs` (sha256 `f83cbd7c9eed0becd3f5df219b6d1b37e87aa264fdd4f9a6f84bc2910a13055a`).

**Paths touched:** `src/vacation/trek-thing-detail-v3-patch.mjs`, `public/assets/index-BKun7ofk.js`.

## Local verification (worktree `a6618e0c`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_served_star_rating_bundle.mjs` | passed |
| `node scripts/test_served_trek_bundle.mjs` | passed |
| `node scripts/test_issue_964_detail_overall_rating_row.mjs` | passed |
| `node scripts/test_issue_951_thing_detail_pencil_price.mjs` | passed |
| `node scripts/test_ui_737_viewer_detail_area.mjs` | passed |
| `node scripts/test_budget_required_price_completeness.mjs` | passed |
| `node scripts/test_offline_manifest.mjs` | passed (455 offline / 21 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | passed (0 fail) |
| `node scripts/check-no-comments.mjs` | **blocked locally** — missing `apps/vacation-client/node_modules/typescript` in this worktree; host/CI node_modules expected |

## Chief dr Gate B (52b0a1a5 auto round 1)

Named 32-screen structure failures and budget list price gaps were **not re-run** in this lane (no `restore_check.py` / staging capture). No list-price helper (`bi`, `ie`, `eu`) changes in this diff. Host should re-run `staging-structure-v6` on the new head after publish.

## Host next steps

Review diff, commit once on `vkfill/969-20261112114227`, push, confirm CI green on the new head. Re-run Gate B on preview tip.

No git stage/commit/push in lane. Hold certify.
