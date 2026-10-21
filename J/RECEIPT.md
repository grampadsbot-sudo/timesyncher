# vkfill-549 round (CI-red secrets + served bundle)

## Fix

- **TARGET 1 (hardcoded content):** Moved Gate B fixture maps (`NYC_GATE_B_ROW_CCAB_KEYS`, aliases, trip id) back into `scripts/fixtures/pr336-vk-search-trip-sources.mjs`. `src/vacation/stored-ccab-narrative-merge.mjs` is data-free: `createStoredCcabNarrativeMerge(enrichment, { fixtureRowCcabKeys })` plus browser `mergeStoredCcabNarrativeIntoOverride` from JSON enrichment only.
- **TARGET 2 (served bundle):** Rebaked `public/assets/index-BKun7ofk.js` via `node scripts/rebake_served_trek_bundle.mjs` after src change.

## Checks (local tip; host push + CI is authority)

```bash
node scripts/test_check_hardcoded_content.mjs && node scripts/check-hardcoded-content.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_evidence_secrets.mjs
cd apps/vacation-client && npm run typecheck && npm run lint && npm run build
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

All above passed on local commit tip (see DONE line). `npm test` in vacation-client skips shell-layout without Chrome; CI runs shell-layout with Chrome.

## Left alone

Description behaviour from a59b0019; no Gate B config, baselines, or workflow edits.
