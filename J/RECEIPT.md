# TSV #969 / PR #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `2d036e59d003a540c5c3196defeafc31b5e837c5` (verified `git rev-parse HEAD` before edit)

## Root cause (CI `unit-tests` on `2d036e59`)

Baked v3 detail in `public/assets/index-BKun7ofk.js` emits contact strip markers as JSX-style literals (`'data-ts-detail-info-box': 'phone'` / `'website'`). `patchLiveProductDetailBundle` → `normalizeBakedV3DetailGateBNeedles` only rewrote `address-hours` and `data-ts-detail-reviews`, so `scripts/test_dossier_staging_fixes_682.mjs` failed on `/data-ts-detail-info-box":"phone"/`.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-thing-detail-patches.mjs` | Extend Gate B needle normalization for `phone` and `website` info-box markers (same transform as `address-hours`). |

## Local verification (starting HEAD `2d036e59`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/test_dossier_staging_fixes_682.mjs` | pass (CI failure file) |
| `node scripts/test_ui_734_round2_punchlist.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |

No git stage/commit/push in lane.

## Host next steps

`git add src/vacation/trek-thing-detail-patches.mjs` → commit → push `vkfill/969-20261112114227` → wait for CI (`unit-tests`, `accept`, `secrets`, `gateb`) on new tip.