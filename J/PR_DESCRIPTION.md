Closes #903

#903 live QA polish. Serve-time title/narrative rewrites were removed (Craig 11/4: displayed text = stored data). Customer wording for rows 609/630–634 now lives in stored fixture source rows. Host base-merge from `origin/vk` @ `86d90ed1` also carries #927 touch splitter + collapsible trip hero and #925 chat-itinerary sequential PUT merge.

## What changed (#903)

- **`live-qa-903-presentation.mjs`:** Dropped `retitleFlightUpsell` and the jargon rewrites at serve time. Kept non-destructive polish: clearing borrowed ratings, cited stars, trip-month hours, and flight time backfill.
- **Fixture sources:** Rows 609/630–634 carry `rentalCompany`, `arrivalTime`, and the row 634 upgrade title/category in `nyc-craig-kim-daybyday-rows.mjs`. The trip builder applies those fields generically, with no id-keyed overrides.
- **Gate B:** Regenerated `pr336-vk-search-places.snapshot.json`. Kept `GATE_B_DISPLAY_TITLE_ALIASES[609]`, because `assertGateBRowProvenance` needs the ccab-key vs display-title split.
- **Tests:** `test_pr336_ccab_search_provenance.mjs` asserts row 609's `approvedDisplayTitle` and built title equal the stored row name (not a stale `Priceline opaque` literal).

## What changed (#927 / vk merge)

- Fix real iOS finger-drag on the vacation-app site/chat splitter: 44px touch target, non-passive `touchstart`/`touchmove`, drag shield overlay, and iframe `pointer-events` isolation while dragging (desktop pointer drag unchanged).
- Add collapsible black shared-trip hero (expanded default, per-slug `localStorage`, three icon buttons remain visible) via `public/ts-trip-hero-collapse.js` on standalone and embedded shared pages; hero collapse mounts only at mobile widths (Gate B daybyday-1280).
- **Budget tab:** `budgetLineAmount` uses `numericPrice` (same as list tabs) so BudgetScreen shows flight/hotel/car prices instead of "Add price".
- Register offline regression tests and a WebKit+iPhone live touch check (`scripts/test_vacation_app_927_webkit_touch_live.mjs`).

## Verification

```bash
node scripts/test_pr336_ccab_search_provenance.mjs
node scripts/test_shared_tab_list_summary.mjs
cd apps/vacation-client && npm test
node apps/vacation-client/test/budget.unit.mjs
node scripts/test_vacation_app_927_hero_collapse.mjs
node scripts/test_vacation_app_927_touch_splitter.mjs
node scripts/regenerate_pr336_search_trip_fixture.mjs
node scripts/build_gateb_canonical_shared_trip.mjs /tmp/canonical.json   # + all-rows title binding check
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

Pre-DONE gates pass on this worktree. Full offline list not re-run this round (prior round: 438/439 pass; `test_live_transcript_dialog_pdf.mjs` needs `pdftotext` on host). Regenerated snapshot byte-identical; all 94 snapshot rows bind to the canonical trip.

## Scope left alone

- `GATE_B_DISPLAY_TITLE_ALIASES[609]`: removing it breaks `assertGateBRowProvenance` for row 609.
- Rows listed by `vk_contract_check_local.mjs` (692–695 ratings/reviews, 710 logo): not part of this round.
- Baselines, Gate B host scripts, workflows, `offline-tests.txt` ratchet files (per brief).
- Live override narratives for 664/669/672 bundle copy until host re-fill.
- Chat itinerary edit persist (#925/#926) product code inherited from merge only; trek bundle rebake not required (no `public/assets/*.js` conflict).
