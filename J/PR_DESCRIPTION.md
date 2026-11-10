#903 — remove serve-time title/narrative rewrites; move rows 609/630–634 customer wording into stored fixture sources.

## What changed

- **`live-qa-903-presentation.mjs`:** Dropped `retitleFlightUpsell` and jargon rewrites at serve time (Craig 11/4: displayed text = stored data). Left non-destructive polish (borrowed ratings, cited stars, trip-month hours, flight time backfill when title already carries clocks).
- **Fixture sources:** Rows 609/630–634 now carry `rentalCompany`, `arrivalTime`, and row 634 upgrade title/category in `nyc-craig-kim-daybyday-rows.mjs`; trip builder applies those fields generically (no id-keyed overrides).
- **Gate B:** Regenerated `pr336-vk-search-places.snapshot.json`; row 609 `rentalCompany` on ccab record; kept `GATE_B_DISPLAY_TITLE_ALIASES[609]` because provenance still needs ccab vs display title split.
- **Tests/replay:** PR225 car stored Express Deal title; trip99 replay row 632/634 wording; binding tests compare raw snapshot text.

## Verification

```bash
cd apps/vacation-client && npm test
node scripts/test_shared_tab_list_summary.mjs
node scripts/test_issue_903_live_qa_polish.mjs
node scripts/test_gate_b_product_row_fields.mjs
node scripts/regenerate_pr336_search_trip_fixture.mjs
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

All of the above passed on worktree at start HEAD `e6a44caf` except the full offline manifest run stops early on unrelated `test_live_transcript_dialog_pdf.mjs` gbrain-cli vs bundled-get_page assertion in this environment.

## Left alone (scope)

- `GATE_B_DISPLAY_TITLE_ALIASES[609]` removal (TARGET D): removing the alias breaks `assertGateBRowProvenance` for row 609 title vs ccabKey.
- Baselines, Gate B host scripts, workflows, `offline-tests.txt`.
- `evidence/` PNG churn from vacation-client tests (reverted in worktree).
