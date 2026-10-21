# VK PR #590 / issue #588 receipt (cursor-ubuntu vkfill-590 CI-fix)

**Branch:** `vkfill/588-20261021125728`  
**Start head:** `5d9e2581`  
**Authority:** GBrain `bot-admin/lanes/vk-pr-handoff/pr-590` + chief-dr CI-fix brief (run 39667545911 `unit-tests`)

## Change

CI `test_same_selection_capture.py` failed because head `5d9e2581` mutated served `places` on fixture replay (`applyLiveAppListRowFields`, ccab logo bind on place rows, in-process replay driver).

- `src/vacation/shared-trip-fixture-replay.mjs`: timeline selection normalization only; served payload keeps original `places` shape (no category-object rewrite, no injected `logoUrl`/`website`).
- Reverted out-of-scope harness/fixture edits from `5d9e2581` (`scripts/ops/capture/timeline-replay.mjs` subprocess producer binding restored; `scripts/fixtures/*` ccab/NYC trip churn reverted).
- `scripts/ops/capture/timeline-replay.mjs`: static re-export of replay module for code ratchet only; capture still loads sanctioned producer worktree at replay time.
- **Kept (app render path):** `apps/vacation-client/src/lib/listTabModel.mjs` `logoUrlForPlace` → `resolveThingLogoUrl` when no explicit URL (generic list logos at render time, not in served trip JSON).

## Local verification

| Command | Result |
| --- | --- |
| `python3 scripts/ops/dispatch/test_same_selection_capture.py` | OK (11 tests) |
| `node scripts/test_capture_fixture_replay_harness.mjs` | OK |
| `cd apps/vacation-client && npm run typecheck && npm run test` | OK |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass (0 fail) |

Full `node scripts/run-offline-tests.mjs` not completed here (no `CHROME_PATH` / puppeteer layout tests on lane host).

## Verdict

CI-fix pushed; host CI + Gate B decide merge eligibility.
