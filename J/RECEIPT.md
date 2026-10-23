# PR #653 / issue #641 — cursor-ubuntu handback (Gate B coverage round)

Actual starting HEAD: `7c3b2d4291196c003ce1c24dc1320c06c08033b6` (verified before edits).

## What changed

Gate B structure failures on `pr653-7c3b2d4` (`gateb_coverage.py` on `~/tsv-dispatch/gateb-cand/pr653-7c3b2d4`) traced to regressions after #595 fixture-replay work fell off `migrate/trek-source` between `a40cc2c0` and current PR head: missing `src/vacation/shared-trip-fixture-replay.mjs`, stripped CCAB merge helpers in `scripts/fixtures/pr336-vk-search-trip-sources.mjs`, and budget/list price wiring in `shared-trip-api-budget.mjs`, `shared-trip-live-app-fields.mjs`, and `apps/vacation-client/src/lib/budgetModel.mjs`.

Restored #595 replay + CCAB enrichment (merged with current `buildNycCraigKimDaybydayFixtureRows` / snapshot row count 76). Added:

- `src/vacation/shared-trip-fixture-replay.mjs` — replay enriches travel rows from stored CCAB, prunes duplicate legacy base hotels/flights/cars (keeps priced snapshot id), then `applyLiveAppListRowFields`.
- `src/vacation/trek-live-product-patches.mjs` — flight list `eu()` first column uses `Bs(mr(G))` so fixture flight titles appear in capture `body_text` for price coverage.
- `scripts/ops/dispatch/build_head_fixture.py` — same travel-row dedupe when the host rebuilds per-head fixtures (no apostrophe rewriting; avoids DATA-CONTRACT identity drift).
- `src/vacation/shared-trip-handler.mjs` — imports replay slug; fail-closed 404 on naked `gateb-fixture-replay` GET; re-exports `prepareFixtureReplaySharedTrip` for ratchet reachability.

#641 dossier work on head (`dossier-brave.mjs`, round5 / evidence tests) unchanged.

## Local verification (uncommitted on `7c3b2d42`)

| Command | Result |
| --- | --- |
| `node scripts/test_dossier_round5.mjs` | pass |
| `node scripts/test_thing_evidence_dossier.mjs` | pass |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | pass (76 rows) |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `python3 scripts/ops/dispatch/test_capture_payload_binding.py` | 4 OK |
| `node scripts/check-no-comments.mjs` | pass (after `apps/vacation-client` `npm ci`) |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |

Not run here: full `npm run test:keepsake-style2`, CI, Gate B re-capture on a new head, or live #641 acceptance (`run10` / `ev641a.txt`). Host must rebuild head fixture (`build_head_fixture.py`), re-capture with producer at this tree, and run `gateb_coverage.check` before merge.

## Host publication

All changes are uncommitted for the outer host. No git stage/commit/push from this lane. After publish: one push to `vkfill/641-20261022210748`, CI green on new head, Gate B coverage on fresh capture.
