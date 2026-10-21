# VK PR #590 / issue #588 receipt (cursor-ubuntu vkfill-590 BASE-MERGE)

**Branch:** `vkfill/588-20261021125728`  
**Start head:** `bf232ddddc5ca1472c275eeba273e0ea8e27027b`  
**Authority:** GBrain `bot-admin/lanes/vk-pr-handoff/pr-590` + chief-dr dirty-head merge brief

## Base merge

Host merged `origin/migrate/trek-source` at `446e19137ebe9c6ee0dab651dca078f2cd35f13f` into `bf232ddd`. Conflicts resolved in `J/` only; took base `public/assets/index-BKun7ofk.js` then rebaked; kept base `src/vacation/shared-trip-oe-list-row-patch.mjs` (`<strong>` default list-row title for Gate B `first_text`).

## Change (PR #588)

CI `test_same_selection_capture.py` failed because head `5d9e2581` mutated served `places` on fixture replay.

- `src/vacation/shared-trip-fixture-replay.mjs`: timeline selection normalization only; served payload keeps original `places` shape.
- Reverted out-of-scope harness/fixture edits from `5d9e2581`; `scripts/ops/capture/timeline-replay.mjs` subprocess producer binding restored.
- **Kept (app render path):** `apps/vacation-client/src/lib/listTabModel.mjs` `logoUrlForPlace` → `resolveThingLogoUrl` when no explicit URL.

## Local verification

| Command | Result |
| --- | --- |
| `python3 scripts/ops/dispatch/test_same_selection_capture.py` | (run at DONE) |
| `cd apps/vacation-client && npm test` | (run at DONE) |
| `node scripts/rebake_served_trek_bundle.mjs` | (run at DONE) |
| offline-tests + pre-DONE gates | (run at DONE) |

## Verdict

Merge commit ready; host CI + Gate B on new tip decide eligibility. Tip sha recorded in DONE line.
