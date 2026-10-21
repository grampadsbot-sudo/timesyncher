# VK PR #578 lane receipt (cursor-ubuntu vkfill-578-20261021075722)

**Start sha:** `a132749f4d79f2d978c7b9eac24d3782af36f2ef`

## Change

Restored portable Gate B **normal caller** bindings dropped when the runtime-only patch landed: `pregate_run_capture`, `base_reference_capture`, deploy/postdeploy staging helpers, and `staging_gate_capture` now pass `render_head`, `TSV_SANCTIONED_REPLAY_PRODUCER_HEAD`, and fixture policy into `capture_and_compare` / `local_capture` / `staging_capture` (support spans + full patch + defs-only patch + manifest). Runtime install artifacts (`capture-replay-runtime.patch`, verify script) unchanged from `a132749f`.

## Commands (exit 0)

- `python3 scripts/test_capture_replay_binding.py` (15)
- `python3 scripts/test_capture_replay_callers.py` (22)
- `python3 scripts/ops/dispatch/test_same_selection_capture.py` (11)
- `node scripts/test_capture_fixture_replay_harness.mjs`
- `node scripts/check-no-comments.mjs`
- `node scripts/test_offline_manifest.mjs`
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs`

## Left alone (scope)

- No runtime `tsv_dispatch.py` install on host (still NOT RUN per managing-dr acceptance).
- No Gate B capture, baseline/workflow/ratchet config edits, or deploy.
