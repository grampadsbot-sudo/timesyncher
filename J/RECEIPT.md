# PR #653 / issue #641 — cursor-ubuntu handback (Gate B coverage round 4)

Actual starting HEAD: `6452bca8f1ea31e88f9496779b2212eeb7fda42e` (verified before edits).

## Root cause (gateb_coverage on `7c3b2d42`)

Capture harness serves `prepareFixtureReplaySharedTrip` payload (not live API). Two defects explained `pr653-7c3b2d4` price/budget failures on top of prior `8a30b075` / `f55e29f` / `6452bca` UI work:

1. **Duplicate flight rows** — NYC base fixture still carries legacy `Transport` rows (ids 13–22) with the same names as snapshot `flight` rows (650+). UI listed the unpriced transport row first; `gateb_coverage` segments body text by name and saw no `$` on the first segment → `price flights-* list: 16/16 … have no price`.
2. **Budget tab** — replay path never ran `syncSharedTripApiBudget`, so capture payload lacked priced `budget[]` lines → `price budget-*: 21/23 hotels …`.

Hotel description quality failures on `7c3b2d2` remain addressed by `f55e29f` / `6452bca` (`rr()` longDetails + `ha(G)` pick chain); needs fresh capture to verify.

## Patch (uncommitted for host)

| File | Change |
| --- | --- |
| `src/vacation/shared-trip-fixture-replay.mjs` | Treat flight-like `Transport` as travel; dedupe travel by normalized name on raw fixture prices (before live price estimation); then presentation/detail/keepsake/list-field enrichment + `syncSharedTripApiBudget`. |
| `scripts/ops/dispatch/build_head_fixture.py` | Same travel dedupe rules when merging pr336 snapshot into `nyc-shared.json`. |
| `scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | Regression: transport+flight name collision drops legacy row and emits budget lines. |

## Local verification (`6452bca` + above diff)

| Command | Result |
| --- | --- |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` (replay dedupe on `head-6452bca.json`) | 1 flight row, 95 budget lines |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |

Not run: Playwright `scripts/ops/capture/capture.mjs` (no `playwright` in repo `node_modules`), fresh `gateb_coverage.check` on `pr653-<newhead7>`, CI, Keepsake QA, live #641 acceptance.

Pre-existing on `6452bca`: `node scripts/test_shared_trip_api_budget_lines.mjs` fails at line 96 (`gateAllowed.has(0)`); unchanged by this pass.

## Host publication

Uncommitted files:

- `src/vacation/shared-trip-fixture-replay.mjs`
- `scripts/ops/dispatch/build_head_fixture.py`
- `scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs`

Host: commit on `vkfill/641-20261022210748`, rebuild head fixture + budget via `build_head_fixture.py` + `fill_budget`, re-capture at published head, run `gateb_coverage.check` on `pr653-<newhead7>`.
