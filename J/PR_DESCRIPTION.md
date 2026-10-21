Closes #546

## Summary

Dr-sanctioned description/layout round (2026-10-21): Gate B on `180b6a4` reported **row layout** (description not on the name line on flights/cars/hotels at 1280) and **generic descriptions** for Smoke Jazz on events. List CSS now keeps name + price + description on one truncated line at 390 and 1280. List copy falls back to stored ccab `longDetails` when composed text is template-generic or under six words.

## Changes

- **`apps/vacation-client/src/styles.css`**: flight row six-column grid; car rows use logo/name/price/description on one line (hide duplicate car-sub on list when class is in description); mobile no longer stacks `.tsv-row-desc` under the name.
- **`apps/vacation-client/src/lib/listTabModel.mjs`**: feed `longDetails` into `composeListRowDescription`; `storedListNarrativeFallback` for non-generic stored narrative when compose output is too short or generic.

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

Baselines, Gate B capture/check config, workflows, fixtures, and `package.json` untouched. Pre-merge Gate B not run here (dispatcher cron).
