# TSV #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `81aeed2239fb9069497cc0cd47102560b0a473c1` (verified before edit)  
**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971`

## Root cause (unit-tests on `81aeed22`)

**CI `scripts/test_product_gaps_staging.mjs`:** Assertions still targeted the pre-#969 detail chrome (`children:["Logo URL"` / `children:["Logo from media"` from `trek-live-product-patches.mjs`). `patchThingDetailV3` in `trek-thing-detail-v3-patch.mjs` replaces that panel with v3 (`data-ts-detail-v3`, `field('logoUrl', 'Logo URL')`, checkmark save `"data-ts-detail-save":"1"`). `renderServedTrekBundle()` output is correct; the staging gap test needles were stale.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `scripts/test_product_gaps_staging.mjs` | Align product-gap needles with #969 v3 detail body (logo URL field, save control, no legacy Logo-from-media grid). |

## Local verification (starting HEAD `81aeed22`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_product_gaps_staging.mjs` | **pass** (was CI fail on `81aeed22`) |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_issue_903_live_qa_polish.mjs` | pass |
| `node scripts/test_issue_959_owner_pencil_webkit.mjs` | pass |
| `cd apps/vacation-client && npm ci && npm run typecheck && npm run lint && npm run test` | pass |
| `node scripts/run-offline-tests.mjs` | **not full pass locally** — `test_live_transcript_dialog_pdf.mjs` uses live `gbrain` CLI on this host (`via=gbrain-cli-get_page`); CI ubuntu has no CLI and expects `bundled-get_page`. Not changed in this round. |

## Gate B

Brief: `gateb=failure` on `81aeed22`; `~/tsv-dispatch/logs/gateb-verdicts.jsonl` shows v6 `named: {}`, structure FAIL on NYC new-look reference screens (expected for #969 label `new-look`; pixel not a coder gate per brief). Host re-run `staging-structure-v6` after publish; no source fix attempted here.

## Host next steps

Single commit on `vkfill/969-20261112114227` with `scripts/test_product_gaps_staging.mjs` only → push → wait for unit-tests + accept + gateb on new tip. No git operations performed in lane.
