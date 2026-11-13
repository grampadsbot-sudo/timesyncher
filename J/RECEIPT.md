# TSV #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `d5579cbbd8845a35d5ffe0b4b2b1c70165682f70` (verified before edit)  
**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971`

## Root cause (hard round tier 1)

1. **CI `scripts/test_served_trek_bundle.mjs`:** `public/assets/index-BKun7ofk.js` was out of sync with `renderServedTrekBundle()` on head `d5579cbb` (committed bundle ≠ patcher output; includes v3 detail body embedded in served asset).
2. **CI `scripts/test_issue_903_live_qa_polish.mjs`:** v3 `fieldHeading` embedded `children: "Itinerary note"` (space after colon). Static QA needle and `patchUi903DetailChrome` contract require `children:"Itinerary note"`. Mismatch also prevented a clean rebake alignment with the patcher.
3. **Gate B (rounds 1–2 on `52b0a1a5` / `1988c8ac`):** Offline NYC budget / `bi()` narrative price backfill already passes on this tree (`test_nyc_budget_search_fill_prices.mjs`, `priceFromTextFields` in `shared-trip-live-app-fields.mjs`). Prior head failures likely combined stale served bundle on staging with the above CI drift. Re-run `staging-structure-v6` after host publishes rebaked asset.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | Align v3 Itinerary note / Details heading literals with #903 bundle needle (`children:"Itinerary note"` / `children:"Details"`). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` — sha256 `8294be02a93dcd4700ef0ff46c7300187d69cfe6fee3bdc29cc23c4769828431`. |

## Local verification (starting HEAD `d5579cbb`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_served_trek_bundle.mjs` | **pass** (was CI fail on `d5579cbb`) |
| `node scripts/test_issue_903_live_qa_polish.mjs` | **pass** |
| `node scripts/test_budget_required_price_completeness.mjs` | pass |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass (455 offline / 21 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| `node scripts/check-no-comments.mjs` | **blocked locally** — `apps/vacation-client/node_modules/typescript` missing; CI/host expected |

## Gate B (chief dr hard round)

Not re-run here (`restore_check.py` / staging capture out of lane scope). Host should re-run `staging-structure-v6` on new tip after publish.

## Host next steps

Review diff → single commit on `vkfill/969-20261112114227` → push → confirm CI green → Gate B on preview tip. No git operations performed in lane.
