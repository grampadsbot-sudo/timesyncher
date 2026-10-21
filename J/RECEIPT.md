# vkfill-549 round 3 (CI-red `rawSearchPlaceFromCcab` export)

## Fix

- **`scripts/fixtures/pr336-vk-search-trip-sources.mjs`**: re-export `rawSearchPlaceFromCcab` (imported from `src/vacation/stored-ccab-narrative-merge.mjs` for internal `buildGateBSearchPlaceForRow` / contract samples but was not a public fixture export after round 2 refactor). Restores the bf1ad7ad public surface for `scripts/test_pr336_ccab_search_provenance.mjs` and `scripts/lib/pr336-stored-narrative-lineage-lib.mjs` importers.

## Checks (local tip; host push + CI is authority)

```bash
node scripts/test_pr336_ccab_search_provenance.mjs
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_evidence_secrets.mjs
node scripts/test_check_hardcoded_content.mjs && node scripts/check-hardcoded-content.mjs
cd apps/vacation-client && npm run typecheck && npm run lint && npm run build && npm test
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

All above passed on local commit tip (see DONE line). Full `scripts/offline-tests.txt` loop failed locally only on `scripts/test_live_transcript_dialog_pdf.mjs` (`gbrain-cli-get_page` vs `bundled-get_page` — env, not this diff). No served-bundle rebake (fixture export only).

## Left alone

Description behaviour, secrets/hardcoded-content layout, baselines, Gate B config, workflows.
