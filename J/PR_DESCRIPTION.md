## Summary

Closes #571. Flight list rows in `apps/vacation-client` derive a short why-pick-it line from long stored summaries (clause picker, flights only); hotels and other tabs keep the full stored text.

## Changes

- `apps/vacation-client/src/lib/listTabModel.mjs` — `pickFlightListRowSummaryText`, flight-only branch in `rowSummary`
- `apps/vacation-client/test/listRows.unit.mjs` — regression for long flight summary vs unchanged hotel row

## Test plan

- [x] `npm run typecheck` in `apps/vacation-client`
- [x] `node apps/vacation-client/test/listRows.unit.mjs`
- [x] `node scripts/check-no-comments.mjs`
- [x] `node scripts/test_offline_manifest.mjs`
- [x] `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`
