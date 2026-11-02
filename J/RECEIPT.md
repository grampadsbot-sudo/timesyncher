# Merge vk into #550 (2026-11-02, grok-lane-3)

Kept both receipt sections below. `src/vacation/trek-style2-bundle.mjs` keeps this PR's `patchInlineListRowDescriptionOnThingHeader` and vk's budget needles (`MO_BUDGET_LEGACY_CI_NEEDLE` / `MO_BUDGET_DS_NEEDLE`). `public/assets/index-BKun7ofk.js` was rebaked with `node scripts/rebake_served_trek_bundle.mjs` (sha256 `cfffc64e2594d192e9394a1de977618ac1781733972f0ba3d3e5d516cfb5654c`). The minified auto-merge was not kept.

# vkfill-550 receipt — flight QoRest flex / row fill (HOST PUBLICATION ONLY)

## Outcome

**source-ready** on start HEAD **bc776027f59da07f24f6cf8beb530941bd7033ea** (verified before edit).

## Root cause (Gate B structure round 18, `bc776027`)

`restore_check.row_layout` on `flights-1280*.png`: Southwest rows **description does not fill the row** (e.g. 199 of 483 px). Gate B verdict `gateb-verdicts.jsonl` 2026-11-02T14:25:56-08:00, sha `bc77602`, gap_close FAIL on #547/#796.

After the QoRest split (airline-only `strong` in the logo–name pair), `QoRest` used `flex:"1 1 0"` beside the inline `data-ts-list-desc` span. QoRest grew and the description box stayed at intrinsic width (~199 px) instead of filling ≥60% of available row space (aaffa24 PASS used ~312/573 px on the same fixture row).

## Change (host publish)

| Path | Why |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | `QoRest` outer wrapper: `flex:"0 1 auto"` + `maxWidth:"55%"` (upgrade needle from old `1 1 0` / `100%`) so price/times/route shrink-wrap; inline description keeps `flex:"1 1 0"` + `minWidth:"35%"` and absorbs remaining row width. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 **257a0bcc2c5a28c2fc4218d1078ced3ff08d85ae45832754d97f41441e83645c**). |

Untouched: row layout width constants on non-flight categories, `#471` logo–name pair, `data-ts-list-desc`, car Remove controls, tests/baselines/Gate B config.

## Checks (local, exit 0)

| Command | Ref |
| --- | --- |
| `node scripts/check-no-comments.mjs` | |
| `node scripts/test_offline_manifest.mjs` | |
| `BASE=vk node scripts/check-code-ratchet.mjs` | 0 fail |
| `node scripts/test_shared_tab_list_summary.mjs` | |
| `node scripts/test_gate_b_row_name_frame.mjs` | |
| `node scripts/test_ui_471_apple_row_name_frame.mjs` | |
| `cd apps/vacation-client && npm test` | |
| `node scripts/rebake_served_trek_bundle.mjs` | |

## Uncommitted (host only)

- `src/vacation/shared-trip-oe-list-row-patch.mjs`
- `public/assets/index-BKun7ofk.js`
- `J/RECEIPT.md` (this file)

Host: commit, push once, re-run Gate B structure on new head.
# PR #801 lane receipt (vkfill-801, composer-2.5)

**Start HEAD (unchanged commit; host publish pending):** `74605610ee076ed84356400778dc3ac30b263701`

**Handoff:** GBrain `bot-admin/lanes/vk-pr-handoff/pr-801` still not found.

## Root cause

`Ci()` only attaches `Ut` reservations when `reservation_time` matches the day date. NYC Gate B fixture rows use `day_id` + `start_time` only (94/94 reservations lack `reservation_time`), so `Qa.flatMap(Ci)` never emitted those transport rows and served `Mo` omitted ~55–72 itinerary places (Amelie Bistro, Tiffany, Macy's, Bodega 88, …).

## Change

- **`src/vacation/trek-style2-bundle.mjs`:** `MO_BUDGET_NEEDLE` unions timeline `Ci` rows with `(Ut||[]).filter(wn=>wn&&wn.place_id)` catalog resolves; transport filter uses `di.item.place_id||di.place_id`; fixed `Array.from(new Map(...)).values())` paren balance.
- **`public/assets/index-BKun7ofk.js`:** rebaked; served `Mo` now includes `(Ut||[]).filter(wn=>wn&&wn.place_id)` (sha256 `1bd64613a74008e706d2028ae495a98382e58b63eef2f1e9315eaae8184b3e98`).
- **Tests:** `test_budget_timeline_only_rows` asserts NYC budget count 87 > assignment-only 15 and sample names; patch asserts updated in `test_shared_tab_filter_chips`, `test_thing_card_ui_keep`, `test_keepsake_style2`.

## Verify (local, uncommitted tree on `74605610`)

```
node scripts/rebake_served_trek_bundle.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/test_budget_itinerary_timeline_selected.mjs
node scripts/test_budget_timeline_only_rows.mjs
node scripts/test_nyc_budget_search_fill_prices.mjs
node scripts/test_check_hardcoded_content.mjs
node scripts/test_shared_tab_filter_chips.mjs
node scripts/test_keepsake_style2.mjs
node scripts/test_thing_card_ui_keep.mjs
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

All passed on this pass.

## Host

Uncommitted files: `src/vacation/trek-style2-bundle.mjs`, `public/assets/index-BKun7ofk.js`, `scripts/test_budget_timeline_only_rows.mjs`, `scripts/test_shared_tab_filter_chips.mjs`, `scripts/test_thing_card_ui_keep.mjs`, `scripts/test_keepsake_style2.mjs`. Host commit + push required; CI/Gate B not run in lane.
