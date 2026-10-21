Closes #546

## Summary

Gate B failed **Smoke Jazz & Supper Club** on events screens with **generic descriptions / under 6 words** because list rows sometimes render only `Start: 9:00 PM` when the trek display title is the short alias **Smoke** and stored-ccab prefix binding was blocked for names under 8 characters.

This round allows **unique** short-prefix ccab resolution (`Smoke` → `Smoke Jazz & Supper Club`), merges stored narrative on fixture replay when the alias differs from the ccab key, and clears thin generic `place.description` when narrative merge applies. Prior #549 work (scoped fixture replay ccab merge, Blue Note website identity, list row compose / flight clip) is unchanged.

## Verification

```bash
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_gate_b_product_row_fields.mjs
python3 -m unittest scripts.ops.dispatch.test_same_selection_capture.ProducerAndCacheTests
cd apps/vacation-client && node test/listRows.unit.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

All passed locally on the commit tip below.

## Left alone

No baseline, fixture JSON, Gate B checker, or workflow edits. Other passing list rows per handoff unchanged.
