Closes #903

#903 live QA polish. Serve-time title/narrative rewrites were removed (Craig 11/4: displayed text = stored data). Customer wording for rows 609/630–634 now lives in stored fixture source rows. Host base-merge from `origin/vk` @ `f8d4748f` also carries #884 logo-chip fallback hide, #927 touch splitter + collapsible trip hero, and #925 chat-itinerary sequential PUT merge.

## What changed (#903)

- **`live-qa-903-presentation.mjs`:** Dropped `retitleFlightUpsell` and the jargon rewrites at serve time. Kept non-destructive polish: clearing borrowed ratings, cited stars, trip-month hours, and flight time backfill.
- **Fixture sources:** Rows 609/630–634 carry `rentalCompany`, `arrivalTime`, and the row 634 upgrade title/category in `nyc-craig-kim-daybyday-rows.mjs`. The trip builder applies those fields generically, with no id-keyed overrides.
- **Gate B:** Regenerated `pr336-vk-search-places.snapshot.json`. Kept `GATE_B_DISPLAY_TITLE_ALIASES[609]`, because `assertGateBRowProvenance` needs the ccab-key vs display-title split.
- **Tests:** `test_pr336_ccab_search_provenance.mjs` asserts row 609's `approvedDisplayTitle` and built title equal the stored row name (not a stale `Priceline opaque` literal).

## What changed (#884 / #927 / vk merge)

- **#884 logo chips:** Fallback emoji (`.tsv-logo-fallback`) hidden after brand `img` loads (`thing-logo-ink-center.mjs`, `thing-logo-fallback-url.mjs`, `logoChipHandlers.mjs`, `shared-trip-logo-audit.mjs` `fallback_stack` check). Rebaked `public/assets/index-BKun7ofk.js` from vk base via `scripts/rebake_served_trek_bundle.mjs`.
- **#927:** 44px touch splitter (non-passive touch handlers, drag shield), mobile-only collapsible shared-trip hero (`ts-trip-hero-collapse.js` ≤844px), budget tab `budgetLineAmount` uses `numericPrice`.
- **#925:** Chat itinerary sequential PUT merge (`mergeStoredChatItineraryScheduleOverride`).

**vk base merge @ `f8d4748f`:** into `308ed5e4`; conflicts resolved: `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, `public/assets/index-BKun7ofk.js` (vk bundle + rebake). See `J/RECEIPT.md`.

## Verification

```bash
node scripts/test_pr336_ccab_search_provenance.mjs
node scripts/test_shared_tab_list_summary.mjs
node scripts/test_ui_884_logo_chip_fallback_hide.mjs
node scripts/test_shared_logo_chip_center_bundle.mjs
node scripts/test_shared_trip_live_tab_logos.mjs
node scripts/test_served_trek_bundle.mjs
cd apps/vacation-client && npm test
node apps/vacation-client/test/budget.unit.mjs
node scripts/test_vacation_app_927_hero_collapse.mjs
node scripts/test_vacation_app_927_touch_splitter.mjs
node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
node scripts/regenerate_pr336_search_trip_fixture.mjs
node scripts/build_gateb_canonical_shared_trip.mjs /tmp/canonical.json
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

Pre-DONE gates on lane worktree — see `J/RECEIPT.md` for command results. CI + Gate B on host-pushed head after merge commit.

## Scope left alone

- `GATE_B_DISPLAY_TITLE_ALIASES[609]`: removing it breaks `assertGateBRowProvenance` for row 609.
- Rows listed by `vk_contract_check_local.mjs` (692–695 ratings/reviews, 710 logo): not part of this round.
- `hold:test-trip-fixture` — Marriott `logoUrl` replay vs live is data/harness, not the #884 stacking fix.
- Baselines, Gate B host scripts, workflows (per brief).
- Live override narratives for 664/669/672 bundle copy until host re-fill.
