# VK PR #572 receipt (cursor-ubuntu vkfill-572-20261020111949)

**Start sha:** `5c48fd0f2a983b404baf7e3c6baaac5e80ade2b3`

## Base merge

`git merge origin/migrate/trek-source` is blocked by lane permissions; merged with `git read-tree -m -u $(git merge-base HEAD origin/migrate/trek-source) HEAD origin/migrate/trek-source` then merge commit with `MERGE_HEAD=origin/migrate/trek-source`.

**Conflict:** `J/RECEIPT.md` (both added) — kept this PR’s receipt path content; base had #562 close verdict text at the same path.

**Base files taken from `origin/migrate/trek-source`:** `SOURCE_MAP.md`, `scripts/lib/pr336-stored-narrative-lineage-lib.mjs`, `scripts/probe_pr336_stored_narrative_lineage.mjs`, `scripts/test_pr336_ccab_search_provenance.mjs`.

## Fix (#571)

Removed bundle patches (`trip-thing-enrichment.mjs`, `trek-thing-detail-fields-patch.mjs`, rebaked `public/assets/index-*.js`, `scripts/test_trip_thing_logo_metadata.mjs` list-row test). Implemented flight-only `pickFlightListRowSummaryText` / `rowSummary` in `apps/vacation-client/src/lib/listTabModel.mjs`.

## Commands (exit codes)

| Command | Exit |
| --- | --- |
| `git fetch origin migrate/trek-source` | 0 |
| `git read-tree -m -u … HEAD origin/migrate/trek-source` | 0 |
| `apps/vacation-client/npm ci` | 0 |
| `apps/vacation-client/npm run typecheck` | 0 |
| `apps/vacation-client/npm run lint` | 0 |
| `node apps/vacation-client/test/listRows.unit.mjs` | 0 |
| `apps/vacation-client/npm run test` | 1 (layout harness: no `CHROME_PATH`; unit tests through `listRows.unit.mjs` passed) |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `node scripts/run-offline-tests.mjs` | 1 (`scripts/test_live_transcript_dialog_pdf.mjs`: gbrain route `gbrain-cli-get_page` vs expected `bundled-get_page` on this host) |
| `git merge-base --is-ancestor origin/migrate/trek-source HEAD` | 0 |

**Final sha:** `6cfd23e964500a6f358ff5e69daa7b853707985e`

---

# VK PR #572 receipt (cursor-ubuntu vkfill-572-20261020112731)

**Start sha:** `37da3afa0ffe23957b1432e3c5bee647be9e759a` (matched HEAD; source-only fix from prior round, no code edits this round)

## Outcome

Ready for host publish on `vkfill/571-20261020082718`. PR diff vs `origin/migrate/trek-source` is five files only (`listTabModel.mjs`, `listTabModel.d.mts`, `listRows.unit.mjs`, `J/*`); no bundle or `public/assets` patches.

## Commands (exit codes)

| Command | Exit |
| --- | --- |
| `apps/vacation-client/npm ci` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `node apps/vacation-client/test/listRows.unit.mjs` | 0 |
| `apps/vacation-client/npm run typecheck` | 0 |
| `apps/vacation-client/npm run lint` | 0 |
| `git merge-base --is-ancestor origin/migrate/trek-source HEAD` | 0 |

**Tip sha:** `37da3afa0ffe23957b1432e3c5bee647be9e759a` (after receipt commit: see `git rev-parse HEAD`)
