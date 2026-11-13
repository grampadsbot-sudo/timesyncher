# TSV #969 / PR #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `d0aa19cade05e5139685cedf4d42c20d76b347bc` (verified `git rev-parse HEAD` before edit)

## Root cause

`patchThingDetailV3` (#969) replaced the legacy detail panel that `#734` round2 had wired with `data-ts-detail-summary-readonly`, website info-box, and HH ordering. The rebaked bundle kept offline substance needles via `__vkDetailSubstanceHarnessStub` only — not in the live v3 viewer — so `scripts/test_nyc_screen_verify_chrome.mjs` timed out on `[data-ts-detail-summary-readonly]`. Accept (`test_ui_734_round2_punchlist.mjs`) also failed on legacy JSX substring checks after v3.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | View mode: `data-ts-detail-summary-readonly`, contact strip (`data-ts-detail-info-box` website/phone, HH after website), edit-only legacy phone/website fields. |
| `src/vacation/trek-ui-734-round2-patch.mjs` | Idempotent validation accepts v3 detail markers (quoted attribute styles). |
| `scripts/test_ui_734_round2_punchlist.mjs` | Assert v3 runtime + harness contracts, not removed legacy JSX only. |
| `public/assets/index-BKun7ofk.js` | Rebaked `sha256=44f7baf82ecad31b6c567989386866744a628b14eed1222a1fb5fd6e99f2733a`. |
| `.artifacts/nyc-screen-verify/**` | Refreshed by passing local chrome verify (optional for host commit). |

## Local verification (starting HEAD `d0aa19ca`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | pass |
| `node scripts/test_nyc_screen_verify_chrome.mjs` | pass (CI failure selector) |
| `node scripts/test_list_row_description_substance.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_ui_734_round2_punchlist.mjs` | pass (accept) |
| `npm run test:keepsake-style2` | pass |

No git stage/commit/push in lane.

## Host next steps

`git add` source + rebake (+ optional artifacts) → commit → push `vkfill/969-20261112114227` → wait for CI (`unit-tests`, `accept`, `secrets`, `gateb`) on new tip.
