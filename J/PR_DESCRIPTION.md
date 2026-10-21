Closes #546

## Summary

Gate B failed **Smoke Jazz & Supper Club** with **generic descriptions / under 6 words** because fixture replay skipped stored-ccab narrative merge when the display title already matched the ccab key and the row had no website (capture showed only `Start: 9:00 PM` while live serve had full stored copy).

Earlier work (1141d5ce) fixed short alias titles like **Smoke**; this round aligns **fixture replay** with live serve when copy is thin or generic (`Documented NYC option (music)`), including full-title rows.

## Changes

- **`shouldMergeStoredCcabOnFixtureReplay`**: merge when resolved ccab narrative is missing, under 30 words, or generic.
- **`mergeStoredCcabNarrativeIntoOverride`**: replace generic/thin existing text, not only empty overrides.
- **`test_stored_ccab_canonical_identity.mjs`**: full-title Smoke replay without website must reach ≥30 words in `rowSummary`.

## Verification

```bash
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_gate_b_product_row_fields.mjs
cd apps/vacation-client && node test/listRows.unit.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

All passed locally on tip before push.

## Left alone

No baseline, Gate B checker config, workflow, or fixture JSON edits. Blue Note and other passing rows unchanged.
