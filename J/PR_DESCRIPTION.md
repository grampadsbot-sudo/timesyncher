Closes #989

## Summary

Merges `origin/vk` at `01521be4` into PR #991 and resolves conflicts. Branch retains **#989** acceptance fixes (shared-trip payload / fetch-once / itinerary load latency) plus **vk** **#988** essence-ladder fill changes (no summary→details fallbacks).

## Conflict resolution

- `scripts/offline-tests.txt`: union of `test_acceptance_988_no_summary_details_fallback.mjs` and the three #989 acceptance scripts.
- `J/RECEIPT.md`: PR receipt + base-merge note.

## Checks (local, start HEAD `36873572`, merge tree)

```bash
cd apps/vacation-client && npm test
node scripts/rebake_served_trek_bundle.mjs
node scripts/test_acceptance_988_no_summary_details_fallback.mjs
node scripts/test_acceptance_989_shared_payload_omits_dossier.mjs
node scripts/test_acceptance_989_payload_fetch_once.mjs
node scripts/test_acceptance_989_itinerary_load_latency.mjs
node scripts/test_offline_manifest.mjs
node scripts/check-no-comments.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

All passed after root `npm ci` (468 offline manifest entries).

## Left alone (scope)

Baselines, Gate B capture config, workflows, `vercel.json`, fixture NYC data. Full offline manifest suite not re-run serially in lane (host/CI).