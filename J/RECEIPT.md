# TSV #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `14206847fd0fdc251e622598f253fb87ee3db24a` (verified before edit)  
**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971` — read via job brief (not independently fetched this pass)

## Root cause

`patchThingDetailV3` (#969) replaced the legacy detail editor body, so the served bundle no longer embedded the happy-hour guard strings that `scripts/test_thing_card_ui_keep.mjs` asserts (`!/^no happy hour\b/i.test(raw)` and bar edit `(zi(Dt)||It(Dt)==="bar")&&(Ce||…`). Gate B budget/list price gaps on head `52b0a1a5` also traced partly to upstream `bi()` reading only overlay `price`, not dossier/description dollars when overlay is blank.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | View-mode Happy Hour omits “no happy hour” placeholders; edit-mode bar/restaurant HH checkbox + guarded HH details textarea (same contract as fields patch). |
| `src/vacation/trek-thing-price-bundle-patch.mjs` | **New** — patch served `bi()` to fall back to description/sourceRecord when overlay price is empty. |
| `src/vacation/trek-live-product-patches.mjs` | Apply price reader patch in `applyLiveProductPatches`; drop redundant re-export (keeps FILE-SIZE-500 ratchet). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` — sha256 `c59901b4099f160a253d85d38f000dceb0ad20248c4999a288c48c23cf793f77`. |

## Local verification (starting HEAD `14206847`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_thing_card_ui_keep.mjs` | **pass** (CI failure on `14206847`) |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_served_star_rating_bundle.mjs` | pass |
| `node scripts/test_issue_964_detail_overall_rating_row.mjs` | pass |
| `node scripts/test_issue_951_thing_detail_pencil_price.mjs` | pass |
| `node scripts/test_budget_required_price_completeness.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass (455 offline / 21 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| `node scripts/check-no-comments.mjs` | **blocked locally** — `apps/vacation-client/node_modules/typescript` missing in worktree; host/CI expected |

## Gate B (chief dr round 1 on `52b0a1a5`)

Not re-run here (`restore_check.py` / staging capture out of lane scope). `bi()` dossier fallback should surface `$` on flight/hotel/car rows when VK fill left price in description only. Host should re-run `staging-structure-v6` on new head after publish.

## Host next steps

Review diff → single commit on `vkfill/969-20261112114227` → push → confirm CI green → Gate B on preview tip. No git operations performed in lane.
