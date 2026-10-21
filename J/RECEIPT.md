# vkfill-549 round (base merge + Gate B generic/logo)

## Step 1 — merge `origin/migrate/trek-source`

Resolved conflicts keeping #549 J/ text, both fixture imports (`bindPr336GateBCanonicalIdentity` + `enrichSearchPlace`), base `timeline-replay.mjs` capture binding, merged `listTabModel` (#549 ccab helpers + base `pickFlightListRowSummaryText` export), then rebaked `public/assets/index-BKun7ofk.js`.

## Step 2 — Gate B rows (generic descriptions, logo lost)

- **`list-row-description.mjs`**: never compose or finalize generic `Documented … option` placeholder copy; bundle `tsListRowDescription` matches.
- **`flight-list-row-summary.mjs`**: flight clip no longer returns documented-option placeholders.
- **`listTabModel.mjs`**: `logoUrlForPlace` merges stored ccab + `resolveThingLogoUrl`.
- **`shared-trip-fixture-replay.mjs`**: replay served trip runs `applyLiveAppListRowFields` after ccab merge.
- **`scripts/test_stored_ccab_canonical_identity.mjs`**: placeholder never rendered; Strand logo stable across fixture replay.

## Checks (local; host push + CI/Gate B authority)

```bash
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_capture_fixture_replay_harness.mjs
cd apps/vacation-client && npm test
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

## Left alone

Baselines, Gate B checker config, workflows, `scripts/offline-tests.txt`, fixture JSON bodies.
