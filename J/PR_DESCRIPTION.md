Closes #546

## Summary

Craig 2026-10-21 (#546): Hotels tab rows need **sourced, non-generic** list descriptions (80% rule). Only **Motto** had review-overlay substance; other stored-ccab hotels kept **planning-note** summaries (`Neighborhood:…; Rating:…`) as the list hook.

Prior rounds fixed Smoke Jazz fixture replay and event ccab binding; this round fixes **hotel** stored-ccab list binding.

## Changes

- **`hotelStoredCcabListNarrative` / `isHotelPlanningNote`** (`trip-thing-enrichment.mjs`): turn ccab neighborhood, ratings, and price into substantive hotel list copy instead of the planning-note template.
- **`mergeStoredCcabNarrativeIntoOverride`** (`pr336-vk-search-trip-sources.mjs`): merge planning-note hotel rows; copy `thirdPartySource` and `neighborhood`; preserve Motto when `websiteFlavour` is already present.
- **`test_stored_ccab_canonical_identity.mjs`**: top Gate B hotel names must not lead with `Neighborhood:` and must include substance cues; Motto overlay unchanged.

## Verification

```bash
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_gate_b_product_row_fields.mjs
cd apps/vacation-client && node test/listRows.unit.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

All passed locally on commit tip.

## Left alone

No baseline, Gate B checker config, workflow, or `nyc_ccab` / vk-reviews fixture JSON edits. Event and car rows unchanged.
