Closes #546

## Summary

Merge current `migrate/trek-source` (budget #580, flight list-row summary #586, capture replay binding) into #549, then fix the two Gate B structure failures on the prior head: generic `Documented NYC option (…)` list/timeline copy and logos dropped after stored-ccab merge/replay.

## Changes

- Completed host-started merge; rebaked served trek bundle.
- List-row description compose/finalize and served `tsListRowDescription` reject generic documented-option placeholders; ccab merge still supplies real narratives.
- `logoUrlForPlace` uses stored-ccab merge + `resolveThingLogoUrl`; fixture replay applies live list-row fields (including logos).
- Extended `scripts/test_stored_ccab_canonical_identity.mjs` for placeholder + Strand logo replay.

## Verification

```bash
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_capture_fixture_replay_harness.mjs
cd apps/vacation-client && npm test
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

## Left alone

Baselines, Gate B capture thresholds/allowlists, workflows, NYC fixture JSON.
