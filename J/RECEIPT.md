# PR #687 vkfill-687 hard round tier 1 (cursor-ubuntu)

**Start HEAD:** `767180412f2cf0dfff1d1b0b5d2dd6168d462169` (verified before edit).

## Why Gate B still failed on 76718041 (root cause)

1. **Hotels list / unit-tests scan:** `OE_ROW_SUMMARY_PATCH` still emitted inline `overflowWrap:"anywhere"` after the tab-level clamp moved to `break-word`. `assertPatchedStyleTwo` and served-bundle scans treat `anywhere` as a banned letter-stack pattern (see PR #687 comment thread on `76718041` CI fix).
2. **Capture row metadata:** Hotel title rows used only `data-ts-hotel-row-head`, while `scripts/ops/capture/capture.mjs` resolves list row names via `[data-ts-list-row-name]` (flights/cars already had it). Missing marker weakened name/price row binding in coverage replay.
3. **Flight list 0/16 priced (unchanged):** Fixture titles (`American Airlines JFK → LAS`) vs rendered labels (`Flight option: …`) — `gateb_coverage.py` `_name_start` miss; capture JSON still has `price_text` on rows. **Harness fault** per chief brief; no product rename.

## Source changes (uncommitted; host publish)

| File | Change |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | Hotel summary inline `overflowWrap` → `break-word`; hotel `je()` head adds `data-ts-list-row-name="1"` alongside `data-ts-hotel-row-head`. |
| `public/assets/index-BKun7ofk.js` | Regenerated via `renderServedTrekBundle` (not hand-edited). |

**Prior head already contained (no re-edit this round):** `ha(G)` merge in `trek-thing-detail-capture-patch.mjs`, long hotel `Ld` + 2-line clamp, `syncSharedTripApiBudget` identity dedupe — NYC fixture `prepareSharedTripForLiveApp`: 22/22 hotel budget lines priced; `gateBBudgetPriceCompleteness` pass.

## Tests run (worktree `76718041` + this diff)

- `node scripts/test_served_trek_bundle.mjs` — pass
- `node scripts/test_shared_trip_live_tab_logos.mjs` — pass
- `node scripts/test_gate_b_live_tab_logo_rows.mjs` — pass
- `node scripts/test_shared_trip_api_budget_lines.mjs` — pass
- `node scripts/test_gate_b_product_row_fields.mjs` — pass
- `node scripts/test_dossier_staging_fixes_682.mjs` — pass
- `node scripts/test_keepsake_style2.mjs` — pass
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — pass

## NOT RUN (host / pipeline)

- Gate B pixel + `gateb_coverage.py` on new head (Ubuntu `capture-staging.sh` / `gateb_compare.sh`).
- Managing-dr hotel description judgments for four hotels (quality gate prerequisite).
- CI on pushed head (host publication only).

## Expected Gate B impact (infer; re-verify on capture)

- Hotels: inline `break-word` + existing 2-line clamp; row name marker for capture.
- Budget hotel amounts: should remain bound via existing `ha` + API budget sync (source-level 22/22 priced on NYC fixture).
- Flights list price FAIL likely unchanged until checker name alignment (do not rename rows).

## R8

Not a dedicated R8 replay this round; `test_gate_b_product_row_fields.mjs` pr336 binding checks — pass at source level.

**Next head:** host commit + push from dirty tree; Gate B on new SHA.
