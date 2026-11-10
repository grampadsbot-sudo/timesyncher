# TSV #944 — PT/ET one-line at 390 without breaking #558 (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH. **Base after merge:** `origin/vk` `6017b330` (PR #896 / #888 already live: conflict banners wrap). **Lane start HEAD was:** `5a0d72e`. **Lane:** cursor-ubuntu. **Authority:** eggbot 5:56 AM PT 11/10 (`eggbot:banner-tz-clip-20261110-0556`), continued 6:12 AM PT after #896 shipped.

## Residual after #896

Live `6017b330` already unwraps Day-by-Day conflict banners at 390 ("Conflict with American Airlines LAS → JFK" unclipped). `12:37 pm PT` still soft-wraps because the served timeline grid caps the time column at `minmax(52px,64px)` (intrinsic width of `12:37 pm PT` at 11px/700 is 77.58px). A fixed `72px` or `80px` cap fails `test_ui_558_daybyday_time_name_baseline.mjs` (Statue of Liberty walking tour baseline delta 14.94px) by stealing title width on Day 2.

## Product fix

- Keep #896 conflict-label wrap (`CONFLICT_LABEL_PATCH_WRAP` in `trek-shared-layout-patches.mjs` and the matching patches in `trek-live-product-patches.mjs` / flight-day patches). Do not revert it.
- Change the day timeline grid from `minmax(52px,64px)` to `minmax(52px,max-content)` so a time+zone string can size the column on days that need it (Day 1 flights), while Day 2 single-time rows keep a narrow column and pass #558.
- New `scripts/test_issue_944_daybyday_banner_tz_390.mjs`: banners unclipped (no nowrap+hidden), and PT/ET must not sit on their own line box (client-rect check, not only innerText newlines).
- Vacation-client `styles.css` timeline column left at #896/`vk` (72px). The live site pane uses the served inline grid, not that CSS.

**Unchanged:** conflict calc, #891 TZ text, NYC lock / trip 99, Gate B baselines.

## Checks

Recorded after rebake on the merged tree.
