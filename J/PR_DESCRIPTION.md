Closes #546

## Summary

Description substance round (2026-10-21): list rows now merge stored ccab narrative at display time, drop pipeline diagnostic copy (`Blocked:`, `ccab capture`, list-only stubs), replace timing-only shells with long sourced text, and include car `longDetails` in composed summaries. Midtown list-only hotel (608) shows an honest unbound planning line instead of internal capture text.

## Changes

- **`apps/vacation-client/src/lib/listTabModel.mjs`**: merge stored ccab into overrides before compose; `finalizeListRowDisplayDescription` + unbound-hotel spare when `provenanceBlocker` is set.
- **`src/vacation/list-row-description.mjs`**: car longDetails in compose; experience timing-shell fallback to `longDetails`; `finalizeListRowDisplayDescription`; trek bundle snippet parity (diagnostic filter, spare fallback, car detail).
- **`src/vacation/trip-thing-enrichment.mjs`**: `isListRowPipelineDiagnostic`, `hotelListRowUnboundNarrative`.
- **`scripts/fixtures/pr336-vk-search-trip-sources.mjs`**: treat diagnostic snapshot copy as empty for merge; skip early-return when existing narrative is pipeline text.

## Verification

```bash
python3 scripts/ops/dispatch/test_same_selection_capture.py
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node apps/vacation-client/test/listRows.unit.mjs
cd apps/vacation-client && npm run typecheck
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

All passed locally on tip sha below.

## Left alone

Baselines, Gate B capture/check config, workflows, fixture JSON bodies, and `package.json` untouched. Pre-merge Gate B not run here (dispatcher cron).
