# TSV #971 (PR #969 publication) — lane receipt

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971` — **not found** (rc1 page_not_found on this pass).

**Lane:** cursor-ubuntu / composer-2.5 only · HOST PUBLICATION ONLY  
**Starting HEAD:** `52b0a1a5b5bd69c545b405ac1b4eb93b3e6e4da0` (verified before edit)

## Change (uncommitted)

`patchThingDetailV3` (#969) dropped the upstream edit-mode **Area** neighborhood `<select>` (`value:En(Dt)`, `Ke.map` options) when it replaced the legacy detail body with `detailBodyV3`. That broke `scripts/test_served_trek_bundle.mjs` and duplicated Area as a plain text field in edit mode.

Fix in `src/vacation/trek-thing-detail-v3-patch.mjs`:

- Prepend the original Area `<select>` snippet into the edit-mode `fieldset` extras (same upstream string the bundle test slices).
- Show **Area** in view mode only via `field('area', 'Area')` (`!edit ? field(...) : null`).
- Rename patch boundary `throw` messages to drop customer-facing **Thing** wording (BAR-THING-CUSTOMER).

Rebaked `public/assets/index-BKun7ofk.js` with `node scripts/rebake_served_trek_bundle.mjs` (sha256 `fb8e6cde40f9551b6fd73e6911ebf46ce688ddd9b8360a7ebabc54fc5c9e9056`).

**Paths touched:** `src/vacation/trek-thing-detail-v3-patch.mjs`, `public/assets/index-BKun7ofk.js`.

## Local verification (worktree `52b0a1a5`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_check_hardcoded_content.mjs` | passed |
| `node scripts/test_served_trek_bundle.mjs` | passed |
| `node scripts/test_issue_964_detail_overall_rating_row.mjs` | passed |
| `node scripts/test_ui_737_viewer_detail_area.mjs` | passed |
| `node scripts/test_issue_951_thing_detail_pencil_price.mjs` | passed |
| `node scripts/test_budget_required_price_completeness.mjs` | passed |
| `node scripts/test_offline_manifest.mjs` | passed (455 offline / 21 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | passed (0 fail) |
| `node scripts/check-no-comments.mjs` | **blocked locally** — missing `apps/vacation-client/node_modules/typescript` in this worktree; host/CI node_modules expected |

## Chief dr Gate B (52b0a1a5 auto round 1)

Named failures on **32/32** structure screens plus budget list price gaps for flights/hotels/cars were **not re-run** in this lane (no staging capture / `restore_check.py` harness executed here). No product change beyond detail Area wiring; list price helpers (`bi`, `eu`) unchanged in the rebake diff. Host should re-run `staging-structure-v6` on the new head after publish.

## Host next steps

Review diff, commit once on `vkfill/969-20261112114227`, push, confirm CI green on the new head. Update PR description with commands/results. Re-run Gate B on preview tip.

No git stage/commit/push in lane. Hold certify.
