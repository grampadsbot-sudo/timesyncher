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
