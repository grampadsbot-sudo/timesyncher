# vkfill-549 round 5 (base `origin/vk` ebaaa74e)

**Start sha:** `2bcb83e1`

## Changes

- Merged `origin/vk` (`ebaaa74e`) into #549; kept list-row substance (`composeListRowDescription`, `listRowSubstanceDescription`, `stored-ccab-narrative-merge`).
- **Hotel fill:** `enrichSearchPlace` applies `hotelStoredCcabListNarrative` after vk detail-judge flow so search/trip-fill stores substantive hotel copy, not `Neighborhood:` planning templates.
- **Ccab alias:** `resolveNycCcabKey` normalization in stored-ccab lookup (fixes `Romer Hell's Kitchen` → curly-apostrophe enrichment key).
- **608 fallback:** `listTabModel.mjs` uses `hotelListRowUnboundNarrative` when incomplete-contract hotel copy is under 30 words.
- **Tests:** all `NYC_STAGING_CAPTURE_LIST_ROWS` hotels + Romer apostrophe; gate-b negative fixture expects only row **608** price gap after ccab merge.
- Rebaked `public/assets/index-BKun7ofk.js` after vk merge.

## Checks (local)

```bash
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_gate_b_product_row_fields.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

## Left alone

Baselines, Gate B checker config/thresholds, workflows, deploy. No layout change beyond existing `.tsv-row-desc` inline hotel copy.

**Tip sha:** `9eac3741`
