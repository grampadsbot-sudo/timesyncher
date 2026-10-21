Closes #546

## Summary

Gate B description substance (#546) plus CI fixes on `migrate/trek-source`: list-row ccab merge, vite-safe client path, secrets/hardcoded-content split, served bundle rebake. **This round** restores the missing fixture export that broke `unit-tests` after round 2.

## Changes (latest round)

- **`scripts/fixtures/pr336-vk-search-trip-sources.mjs`**: `export { rawSearchPlaceFromCcab }` so provenance and lineage tests import it from the fixture again (same implementation in `stored-ccab-narrative-merge.mjs`).

## Prior rounds (on branch)

- Description merge / diagnostic filter / `listTabModel` + `list-row-description.mjs`.
- Data-free `stored-ccab-narrative-merge.mjs`; fixture-bound `createStoredCcabNarrativeMerge(ENRICHMENT, …)`.
- Rebaked `public/assets/index-BKun7ofk.js` when src changed served trek output.

## Verification (local tip)

```bash
node scripts/test_pr336_ccab_search_provenance.mjs
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
cd apps/vacation-client && npm run typecheck && npm run lint && npm run build && npm test
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

## Left alone

Baselines, Gate B capture/check config, workflows, fixture JSON bodies, `package.json`. Pre-merge Gate B runs on CI after green `unit-tests`.
