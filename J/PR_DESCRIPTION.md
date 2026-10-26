Closes #680

## Summary

- Pregate `gateb_compare` now masks the day-by-day `map.box` from `capture-regions.json` before pixelmatch and vision close calls, matching `restore_check.py` (map judged by tile evidence, not tile pixels).
- Candidate day-by-day shots still must pass the OSM tile + marker evidence rule; marker count regression vs baseline fails closed when the fixture day expects pins.
- Staged host install bundle under `scripts/ops/dispatch/map680/` (`gateb_compare.py`, `gateb_pregate_map.py`).

## Test plan

- [x] `node scripts/test_gateb_map680_harness.mjs` (unit + PR #653 capture integration when present)
- [x] `node scripts/check-no-comments.mjs`
- [x] `node scripts/test_offline_manifest.mjs`
- [x] `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`
- [ ] Host: install map680 bundle to `~/tsv-gateb/`, rerun pregate on PR #653 head `6931f48` (daybyday-390/1280 PASS)
- [ ] CI green on PR head

## Left alone (scope)

- Baselines, `gateb-allow.json`, capture scripts, `tsv_dispatch.py` call site (auto-loads `capture-regions.json` beside PNG dirs).
- PR #671 price-only compare staging (`price671/`); not bundled here.
