Closes #546

## Summary

Gate B / Craig Hotels tab requirement: **every hotel list row** shows sourced, non-generic description text inline with the name (≥30 words, substance cues), not only Motto.

Host merged `origin/vk` at `6e8812002118a49a906b06d9d854108128a5efcc` into `27fc0e18204adaf6be71abacf69816de57b3e50b` (2026-11-02 BASE-MERGE round); kept PR hotel/ccab list substance plus vk xAI hotel enrichment and exported fixture-replay helpers.

## Changes (this round on `origin/vk`)

- **`trip-thing-enrichment.mjs`** + **`hotel-list-row-narrative.mjs`**: after vk detail-judge search fill, hotels get stored-ccab list narratives so trip-fill persists substantive `description`/`longDetails` (not raw planning-note templates).
- **`stored-ccab-narrative-merge.mjs`**: ccab key lookup uses `resolveNycCcabKey` (straight vs curly apostrophe aliases, e.g. Romer Hell's Kitchen).
- **`pr336-vk-search-trip-sources.mjs`**: re-export stored-ccab merge helpers + `bindPr336GateBCanonicalIdentity` on vk's `buildNycCraigKimDaybydayFixtureRows` / row-description overrides.
- **`listTabModel.mjs`**: incomplete hotel row **608** uses `hotelListRowUnboundNarrative` when composed copy is under 30 words.
- **Tests**: `test_stored_ccab_canonical_identity.mjs` covers every staging-capture hotel row + Romer alias.

Prior #549 work retained: `composeListRowDescription`, `listRowSubstanceDescription`, trek bundle `tsListRowDescription`, car/hotel list substance, incomplete row **608** contract.

## Verification

```bash
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_gate_b_product_row_fields.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

## Left alone

No baseline/threshold/workflow edits. No deploy.
