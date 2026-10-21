# VK PR #549 receipt (cursor-ubuntu vkfill-549, CI-red fix 2026-10-21)

## Outcome

Fixed unit-tests vite build break on `8d3d845e`: `listTabModel.mjs` no longer imports `scripts/fixtures/pr336-vk-search-trip-sources.mjs` (Node `readFileSync`). Stored ccab narrative merge lives in browser-safe `src/vacation/stored-ccab-narrative-merge.mjs` (JSON `with { type: 'json' }` enrichment); fixture re-exports unchanged API for scripts.

## Changes

- `src/vacation/stored-ccab-narrative-merge.mjs` (new): `mergeStoredCcabNarrativeIntoOverride` and related ccab resolution from 8d3d845e behaviour.
- `scripts/fixtures/pr336-vk-search-trip-sources.mjs`: re-export from merge module; gate-b builders unchanged.
- `apps/vacation-client/src/lib/listTabModel.mjs`, `src/vacation/shared-trip-live-app-fields.mjs`: import merge module.

## Checks (local, before commit)

| Command | Exit |
| --- | --- |
| `cd apps/vacation-client && npm ci && npm run typecheck && npm run lint && npm test` | 0 (shell-layout skipped: no Chrome) |
| `cd apps/vacation-client && npm run build` | 0 |
| `python3 scripts/ops/dispatch/test_same_selection_capture.py` | 0 |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | 0 |
| `node scripts/test_list_row_description_substance.mjs` | 0 |
| `node scripts/test_pr336_ccab_search_provenance.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |

Pre-merge Gate B: not run (cron). Prior named rows on `180b6a4`; head after this fix awaits structure verdict on new tip.

Tip sha: `620922da`.
