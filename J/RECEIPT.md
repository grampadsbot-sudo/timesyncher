# #671 host publication receipt (cursor-ubuntu)

Starting HEAD: `0d59c90f1e0df726691ad9e9646b9f30505012c1` (`migrate/trek-source`).

## Source changes (uncommitted; host publishes)

| Path | Purpose |
| --- | --- |
| `scripts/ops/gateb/gateb_close_call.py` | `apply_compare_override()` for post-vision price-only PASS |
| `scripts/ops/gateb/gateb_text_normalize.py` | Apostrophe normalization for coverage + list matching |
| `scripts/ops/dispatch/gateb-compare-price671.patch` | `patch -p1` on `~/tsv-gateb/gateb_compare.py` (close-call hook + `--base-capture` / `GATEB_BASE_CAPTURE`) |
| `scripts/ops/dispatch/price-name-normalization-671.patch` | Already merged at `96444683` for `~/tsv-dispatch/gateb_coverage.py` `_segments` |
| `scripts/ops/dispatch/test_gateb_price671_harness.py` | PR #660 budget vision messages + Romer apostrophe cases |

## Host install (outer publisher)

1. `cd ~/tsv-gateb && patch -p1 < …/scripts/ops/dispatch/gateb-compare-price671.patch`
2. Copy `scripts/ops/gateb/gateb_close_call.py` and `gateb_text_normalize.py` into `~/tsv-gateb/`.
3. Confirm `~/tsv-dispatch/gateb_coverage.py` `_segments` matches `price-name-normalization-671.patch` (apostrophe aliases for Romer Hell's Kitchen).

## Checks run (starting HEAD worktree)

- `node scripts/test_gateb_price671_harness.mjs` — OK (9 tests)
- `node scripts/check-no-comments.mjs` — OK
- `node scripts/test_offline_manifest.mjs` — OK
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — OK
- `patch --dry-run` of `gateb-compare-price671.patch` against `~/tsv-gateb/gateb_compare.py` — OK

## Not claimed here

No Gate B live run, CI green, PR open, merge, or deploy (host publication only).
