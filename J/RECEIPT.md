# PR #653 / issue #641 — cursor-ubuntu handback (Gate B coverage round 2)

Actual starting HEAD: `8a30b0753c9473dc9d5fe362149660a9ae67795d` (verified before edits).

## What changed (uncommitted for host)

Gate B `gateb_coverage.check` on `~/tsv-dispatch/gateb-cand/pr653-7c3b2d4` (capture manifest fixture `heads/7c3b2d4291196c003ce1c24dc1320c06c08033b6.json`, sha `7c3b2d42`) failed price + hotel-description coverage. Root causes:

1. **Prices (list/budget/flights):** duplicate legacy + snapshot travel rows in the head fixture; `prepareFixtureReplaySharedTrip` on `8a30b075` already dedupes and binds CCAB prices (verified locally: 22 hotels, 16 flights priced after replay). Budget “Add price” rows were from unpriced duplicate place ids, not missing snapshot data.
2. **Hotel description quality (3/22 good):** Hotels tab showed `rr()`’s 120-char clipped `summary` inside a `whiteSpace: nowrap` summary line, so capture `items[].desc` stayed ~120 chars and managing-dr scores stayed low despite full CCAB `longDetails` on replay.

Patches (this pass):

- `src/vacation/trek-thing-detail-fields-patch.mjs` — `rr()` prefers hotel `longDetails`/`details` when ≥30 words (matches `listTabModel.rowSummary`), then falls back to clipped itinerary note/summary for other categories.
- `src/vacation/shared-trip-oe-list-row-patch.mjs` — hotel list rows render summary with normal wrapping (non-hotel rows keep single-line ellipsis).

Prior round on `8a30b075` (already on HEAD): fixture replay, budget `priceText` sourceRecord wiring, flight `eu()` first column `Bs(mr(G))`, `build_head_fixture.py` travel dedupe.

## Local verification (tree at `8a30b075` + above edits)

| Command | Result |
| --- | --- |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | pass (76 rows, 39 priced travel) |
| `node scripts/test_vk_hotel_detail_fill.mjs` | pass |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | pass |
| `node scripts/test_shared_site_budget_tab.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |

Not run here: full CI, fresh Gate B capture on new head, `gateb_coverage.check` after re-capture, Keepsake QA, live #641 acceptance (`run10` / `ev641a.txt`).

## Host publication

Uncommitted files:

- `src/vacation/trek-thing-detail-fields-patch.mjs`
- `src/vacation/shared-trip-oe-list-row-patch.mjs`

Host: commit on `vkfill/641-20261022210748`, rebuild head fixture (`build_head_fixture.py`), re-capture with producer at published head, run `gateb_coverage.check` on `pr653-<newhead7>`.
