# TSV #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `9c035f75542bb2dfdb8c8fcef2e76429b4364f8a` (verified before edit)  
**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971`

## Root cause

1. **CI `scripts/test_issue_903_live_qa_polish.mjs`:** `patchUi903DetailChrome` ran before `patchThingDetailV3`, so v3 replaced the legacy detail body and the served bundle never contained `children:"Itinerary note"` after patch.
2. **Gate B budget price misses (prior auto rounds):** `priceFromTextFields` in `shared-trip-live-app-fields.mjs` did not scan `longDetails` / `summary` / `description` on overlays, so VK-filled travel rows kept dollar amounts only in narrative and list/budget UI showed blank prices even when `bi()` dossier fallback existed.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | #903 teal section headings for Itinerary note + Details with literal `children:"Itinerary note"` / `children:"Details"` in served bundle. |
| `src/vacation/trek-style2-bundle.mjs` | Apply `patchUi903DetailChrome` again after v3/964 so QA chrome survives v3 panel swap. |
| `src/vacation/shared-trip-live-app-fields.mjs` | Parse `$` from `longDetails`, `summary`, `description` when syncing live-app row prices. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` — sha256 `7781564a8d18ec106abc58aec387718f01ea3304919e28fd85fb352e2f751c6e`. |

## Local verification (starting HEAD `9c035f75`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_issue_903_live_qa_polish.mjs` | **pass** (was CI fail on `9c035f75`) |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_budget_required_price_completeness.mjs` | pass |
| `node scripts/test_issue_951_thing_detail_pencil_price.mjs` | pass |
| `node scripts/test_thing_card_ui_keep.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass (455 offline / 21 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| `node scripts/check-no-comments.mjs` | **blocked locally** — `apps/vacation-client/node_modules/typescript` missing in worktree; host/CI expected |

## Gate B (chief dr hard round)

Not re-run here (`restore_check.py` / staging capture out of lane scope). Long-details price backfill should surface required flight/hotel/car `$` on budget tabs when overlay `price` is empty. Host should re-run `staging-structure-v6` on new head after publish.

## Host next steps

Review diff → single commit on `vkfill/969-20261112114227` → push → confirm CI green → Gate B on preview tip. No git operations performed in lane.
