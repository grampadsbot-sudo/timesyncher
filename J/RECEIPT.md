# PR #703 Gate B fix-it (2026-10-25)

GBrain handoff page `bot-admin/lanes/vk-pr-handoff/pr-703` was not found at session start (`page_not_found`); work followed the inline PR handoff instead.

# #671 host-reviewed coverage slice

Base d510520afc1fc504a01913d5e45ec6beec1ea191 migrate/trek-source. Exact live coverage preimage eafd0a25ce1ebd8b87afd32910fdf423d32ce5af84e93e823a7ee54da1cf7cc6. Patch changes only _segments: normalize equivalent apostrophe characters in header matching while preserving all original canonical keys, item counts and first-segment behavior. Does not merge duplicate rows, borrow another row price, deduplicate fixture names or change thresholds.

Host six focused cases pass including both canonical spellings, genuinely absent price, next-row price and duplicate first-unpriced row. Actual saved #660 a8dac27 capture at both390/1280:23/23hotel list and23/23hotel Budget names match prices, unchanged denominator23. Every unrelated AST unchanged. No new capture/model call, product data change, Gate B PASS, merge or deploy claimed. The unsafe worker price-only screenshot exception is rejected and uninstalled; #660 remains held on #671. Source bot-admin/receipts/gpt-manager-pass-20261023-0700.

## Round 3 (chief dr auto round 2 failures, start HEAD d39136950a72ea05f161296f3250ab194e2fb645)

Root cause (repro on capture `~/tsv-dispatch/gateb-cand/pr703-d391369` + head fixture `~/tsv-dispatch/fixture-nyc/heads/d39136950a72ea05f161296f3250ab194e2fb645.json`, `gateb_coverage.py`):

1. **Flights list price** — `eu()` first column was airline-only (`ua`); coverage `_segments()` keys on fixture place names (`American Airlines LAS → JFK`, `Flight option: …`), so 0/16 list rows matched despite `price_text` on capture items.
2. **Budget hotel/flight price** — `Mo` tab-list `Map` overwrote priced duplicates with later unpriced copies → body showed `Add price` (22/22 hotels on budget).
3. **Hotel description quality** — list row summary used `Rn=Bs(rr(G))` only; restored `rr||Co||Fl` fallbacks for richer row text (judge still needs Ubuntu capture rerun).

### Source edits (uncommitted; host publish)

- `src/vacation/trek-live-product-patches.mjs`: flight row name `Bs(mr(G))||ua`; upgrade path for rebaked `return[ua,…` bundles; restore `Rn=Bs(rr(G)||Co(G)||Fl(G))`.
- `src/vacation/trek-style2-bundle.mjs`: budget `Mo` dedupe by display name, keep row with `hasPrice`.
- `public/assets/index-BKun7ofk.js`: rebaked (`node scripts/rebake_served_trek_bundle.mjs`, sha256=f624125a3c859dad5cea1513bcbcc07d3963d88ef3a929fb92825ccbfaaa83cc).

### Tests (workspace d3913695 + above diff)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | OK |
| `node scripts/test_served_trek_bundle.mjs` | OK |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | OK |
| `node scripts/test_matrix_r2_ratings_claim_support_round_trip.mjs` | OK |
| `node scripts/check-no-comments.mjs` | OK |
| `node scripts/test_offline_manifest.mjs` | OK |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | OK (after `trek-live-product-patches.mjs` ≤500 lines) |
| `node scripts/test_capture_fixture_replay_harness.mjs` | **BLOCKED** — `capture_replay_binding.CaptureReplayError`: missing registered git worktree under `~/tsv-dispatch/pr-src/capture-producer-roots/1141d5ce…` (host git repair; not a product defect) |

Gate B structure coverage **not** re-captured on this lane turn; host must commit, push once, and rerun Ubuntu Gate B on new head. No CI green claimed.
