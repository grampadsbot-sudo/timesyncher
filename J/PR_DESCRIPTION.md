Closes #903

#903 live QA polish. Serve-time title/narrative rewrites were removed (Craig 11/4: displayed text = stored data). Customer wording for rows 609/630–634 now lives in stored fixture source rows.

## What changed

- **`live-qa-903-presentation.mjs`:** Dropped `retitleFlightUpsell` and the jargon rewrites at serve time. Kept non-destructive polish: clearing borrowed ratings, cited stars, trip-month hours, and flight time backfill.
- **Fixture sources:** Rows 609/630–634 carry `rentalCompany`, `arrivalTime`, and the row 634 upgrade title/category in `nyc-craig-kim-daybyday-rows.mjs`. The trip builder applies those fields generically, with no id-keyed overrides.
- **Gate B:** Regenerated `pr336-vk-search-places.snapshot.json`. Kept `GATE_B_DISPLAY_TITLE_ALIASES[609]`, because `assertGateBRowProvenance` needs the ccab-key vs display-title split.
- **Tests:** The binding tests compare raw snapshot text. `test_pr336_ccab_search_provenance.mjs` no longer pins the stale `Priceline opaque Standard sedan` literal. It asserts that row 609's `approvedDisplayTitle` and built title equal the stored row name. That stale literal was the CI red on `db729549`.

## Verification

```bash
node scripts/test_pr336_ccab_search_provenance.mjs
cd apps/vacation-client && npm test
# every script in scripts/offline-tests.txt
node scripts/regenerate_pr336_search_trip_fixture.mjs
node scripts/build_gateb_canonical_shared_trip.mjs /tmp/canonical.json   # + all-rows title binding check
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

All of these pass. The offline list ran 439 scripts and 438 passed. The one failure is `test_live_transcript_dialog_pdf.mjs`, because `pdftotext` is not installed on the lane host (environment only). The regenerated snapshot is byte-identical, and all 94 snapshot rows bind to the canonical trip.

## Left alone (scope)

- `GATE_B_DISPLAY_TITLE_ALIASES[609]`: removing it breaks `assertGateBRowProvenance` for row 609.
- Rows listed by `vk_contract_check_local.mjs` (692–695 ratings/reviews, 710 logo): not part of this round.
- Baselines, Gate B host scripts, workflows, `offline-tests.txt`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
