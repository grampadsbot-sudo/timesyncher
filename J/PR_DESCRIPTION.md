## Summary

Fixes `unit-tests` failures on `scripts/ops/dispatch/test_same_selection_capture.py` (CI run 39667545911): fixture replay must not rewrite served `places` (category strings stay strings; no replay-time `logoUrl`/`website` injection).

Generic list logos for #588 are resolved in the vacation client at render time via `logoUrlForPlace` → `resolveThingLogoUrl` in `apps/vacation-client/src/lib/listTabModel.mjs`, not by mutating the served trip payload.

Reverted the prior round’s fixture/ccab harness churn and restored the subprocess sanctioned-producer binding in `scripts/ops/capture/timeline-replay.mjs`.

Merged `origin/migrate/trek-source` at `446e1913` (host): kept base `Oe()` `<strong>` list-row title wrap + rebaked served bundle alongside this PR’s replay/logo fixes.

## Test plan

- [x] `python3 scripts/ops/dispatch/test_same_selection_capture.py`
- [x] `node scripts/test_capture_fixture_replay_harness.mjs`
- [x] `cd apps/vacation-client && npm run typecheck && npm run test`
- [x] Pre-DONE: `check-no-comments`, `test_offline_manifest`, `BASE=migrate/trek-source check-code-ratchet`
- [ ] CI `unit-tests` green on PR head (host)
- [ ] Gate B structure mode on 32 screens (host)

## Left alone (scope)

- Baselines, capture/Gate B thresholds, `offline-tests.txt`, NYC reference screenshots
- Fixture/snapshot edits for logo chips (reverted)
