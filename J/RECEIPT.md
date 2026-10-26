# Issue #680 — cursor-ubuntu vkfill-680 (2026-10-23)

**Start sha:** `480ce9a200c81bfc2b40f5ff1c5485eb9aac65ee`

## Outcome

Source-ready for host publication; uncommitted. Host installs `scripts/ops/dispatch/map680/*` to `~/tsv-gateb/` after merge.

## Changes

- `scripts/ops/gateb/gateb_pregate_map.py`: day-by-day map box mask + OSM tile/marker evidence (parity with `restore_check.py` map rule).
- `scripts/ops/dispatch/map680/gateb_compare.py`: pregate pixel compare masks `map.box` for full day-by-day shots; loads `capture-regions.json` from baseline/candidate dirs; runs map evidence on candidate before PASS.
- `scripts/ops/dispatch/map680/README.md`: install paths.
- Tests: `scripts/ops/dispatch/map680/test_gateb_map680.py`, `scripts/ops/dispatch/test_gateb_map680_harness.py`, `scripts/test_gateb_map680_harness.mjs`; registered in `scripts/offline-tests.txt`.

## Local verification (start `480ce9a` + uncommitted diff)

| Command | Result |
| --- | --- |
| `node scripts/test_gateb_map680_harness.mjs` | pass (PR #653 integration on host captures) |
| `node scripts/check-no-comments.mjs` | pass (872 files) |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |

## PR #653 head `6931f48` (host captures)

Rerun after host install:

```bash
python3 scripts/ops/dispatch/map680/gateb_compare.py \
  --baselines /home/ubishere9995/tsv-dispatch/gateb-cand/base-39e5c83-fixture-207bb7a30a4b099c \
  --candidates /home/ubishere9995/tsv-dispatch/gateb-cand/pr653-6931f48 \
  --no-vision --no-post
```

Expect `daybyday-390.png` and `daybyday-1280.png` PASS (integration test uses staged compare with `~/tsv-gateb/pm.mjs`).

## Host-owned

Commit, push once, open PR into `migrate/trek-source` with `Closes #680`, CI, install staged compare to `~/tsv-gateb/`, pre-merge Gate B on PR head.
