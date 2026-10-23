# PR #653 / issue #641 — cursor-ubuntu handback (Gate B coverage round 3)

Actual starting HEAD: `f55e29f4578473fc6db1339de6aa92e3df4ff036` (verified before edits).

## What changed (uncommitted for host)

Gate B `gateb_coverage.check` on `pr653-7c3b2d4` (`7c3b2d4291196c003ce1c24dc1320c06c08033b6`) failed travel prices, budget prices, and hotel description quality. Prior host commits `8a30b075` (fixture replay + CCAB price wiring) and `f55e29f` (hotel list `rr()` + wrapped hotel summaries) address the named failures; this pass fixes a regression in `test_gate_b_product_row_fields.mjs` introduced when `rr()` was refactored to `h.itineraryNote` instead of `ha(G).itineraryNote` in the fallback pick chain.

Patch (this pass):

- `src/vacation/trek-thing-detail-fields-patch.mjs` — keep hotel `longDetails` preference via `h=ha(G)`; restore `ha(G).itineraryNote` / `ha(G).summary` in the clipped pick fallback so the live detail bundle still matches the gate-b product row contract.

Already on branch HEAD from host (`8a30b075`, `f55e29f`): `shared-trip-fixture-replay.mjs`, budget `priceText`, flight `eu()` titles, `build_head_fixture.py` travel dedupe, hotel summary wrapping in `shared-trip-oe-list-row-patch.mjs`.

## Local verification (tree at `f55e29f` + above edit)

| Command | Result |
| --- | --- |
| `npm ci` (repo root) | pass |
| `npm ci` (`apps/vacation-client`) | pass |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | pass (76 rows, 39 priced travel) |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | pass |
| `node scripts/test_shared_site_budget_tab.mjs` | pass |
| `node scripts/test_vk_hotel_detail_fill.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `python3 scripts/ops/dispatch/test_capture_payload_binding.py` | 4 OK |

Not run here: `test_capture_fixture_replay_harness.mjs` (blocked: stale `capture-producer-roots` worktree registration under `~/tsv-dispatch/pr-src`), full CI, fresh Gate B capture on new head, `gateb_coverage.check` after re-capture, Keepsake QA, live #641 acceptance (`run10` / `ev641a.txt`).

## Host publication

Uncommitted files:

- `src/vacation/trek-thing-detail-fields-patch.mjs`

Host: commit on `vkfill/641-20261022210748`, rebuild head fixture (`build_head_fixture.py`), re-capture with producer at published head, run `gateb_coverage.check` on `pr653-<newhead7>`.
