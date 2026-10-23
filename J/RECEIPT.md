# PR #660 host handoff — vkfill-660-20261023014859

Outcome: BLOCKED on full offline-suite execution at starting HEAD `78cadd20e8c8829635f889465efa69db11a0fbee`; proposed source changes remain uncommitted for host review. No acceptance, green-CI-on-new-head, Gate B, publication or merge claim.

## Identity and authority

- Actual starting and final HEAD: `78cadd20e8c8829635f889465efa69db11a0fbee` (the supplied worktree is detached at the required PR head).
- PR #660 / issue #659; existing remote branch `cursor/tsv-659-vk-budget-tab-shows-add-price-for-hotels-that-have-an-amount-romer-hell-s-kitchen-apostr-8f9a`; base `migrate/trek-source`.
- Current PR comments, issue, labels, checks and GBrain handoff were read before editing. Snapshot: job `github-*.json`. Governing targeted request: GBrain `bot-admin/lanes/vk-pr-handoff/pr-660`, including its 2026-10-23 01:50 PT update; latest PR comment https://github.com/grampadsbot-sudo/timesyncher/pull/660#issuecomment-6360977673.
- Runner host-publication rules supersede the brief's commit/push step. No Git metadata mutation, commit, stage, push, merge, rebase, deploy, privileged retry, extra agent, paid model or OpenRouter call was performed. Host owns publication and PR/GBrain updates. All holds and round budgets remain intact.

## Proposed source repair

Applied the source/test/served-asset portions of `/home/ubishere9995/tsv-dispatch/patches/660-pricehydrate-20261023-0140.patch`. Omitted its stale receipt and unrelated whitespace edit.

1. `src/vacation/trek-style2-bundle.mjs`: hydrate missing overlay prices from each place's existing `price` / `total_price`, preserving saved overrides, explicit zero, print settings, stories and unrelated fields. Copy the payload and overrides instead of mutating the API input. Both payload state and override state receive the merged values. Retain the exact existing guarded `pe((G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object")?G.thingOverrides:{})` call.
2. Keep `test_keepsake_style2.mjs:737` unchanged. Restore the strict `assertPatchedStyleTwo` check requiring the complete hydration patch; the saved diff had weakened it to a price substring check. The price reader also reads existing `total_price`; its application fails closed when the served anchor is missing.
3. Extend existing `scripts/test_nyc_vk_budget_list_price_coverage.mjs` with executable tests of the served hydration callback and price accessor: saved prices and zero remain authoritative, missing prices hydrate, settings/story fields survive, input stays unchanged, invalid or absent overrides are guarded, and total prices are available. No new test file or manifest edit.
4. Rebake the existing `public/assets/index-BKun7ofk.js`; SHA-256 `520da812450fcf73ab61a233049284f481a9f6831a6f8b441191961a42201702`.

Source-only proposed patch: job `source-changes.patch`, SHA-256 `3347e9c03b6c5dc99018f6e20265537b5eb2dcdef5ce3c22f92e5a4b32534606`. This patch contains the three source/test/served-asset files; the required receipt is separate.

Feature Map consulted: `features/README.md` -> `features/budget.md`, plus itinerary/list entries. No new UI surface or renderer. Hotel-description quality remains owned by #608; no fixture, baseline, checker, threshold, workflow, dependency manifest, deploy configuration or secret changes.

## Verification on 78cadd20 plus the source-only patch above

| Command | Observed result and evidence |
| --- | --- |
| Saved patch: `node scripts/test_keepsake_style2.mjs` | Reproduced assertion failure at line 737; `saved-patch-keepsake.log`, starting HEAD `78cadd20` |
| Revised patch: `node scripts/rebake_served_trek_bundle.mjs` | exit 0; served bundle hash above, starting HEAD `78cadd20` |
| `node scripts/test_nyc_vk_budget_list_price_coverage.mjs` | PASS; also recorded in `offline-tests-final.log`, starting HEAD `78cadd20` |
| `npm run test:keepsake-style2` | PASS; unchanged line-737 guard; also recorded in `offline-tests-final.log`, starting HEAD `78cadd20` |
| `node scripts/test_served_trek_bundle.mjs` | PASS; rebaked bytes match patcher, starting HEAD `78cadd20` |
| `node --check public/assets/index-BKun7ofk.js` / `git diff --check` | exit 0, starting HEAD `78cadd20` |
| `node scripts/check-no-comments.mjs` | PASS, 850 files; `check-no-comments.log`, starting HEAD `78cadd20` |
| `node scripts/test_offline_manifest.mjs` | PASS, 292 offline / 17 online; `offline-manifest.log`, starting HEAD `78cadd20` |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | PASS, 255 report / 0 fail; `code-ratchet.log`, starting HEAD `78cadd20` |
| `node scripts/check-evidence-secrets.mjs` | PASS; `evidence-secrets.log`, starting HEAD `78cadd20` |
| Full `node scripts/run-offline-tests.mjs` | FAIL, exit 1, 94/292 tests started; `offline-tests-final.log`, starting HEAD `78cadd20`; exact blocker below |

Only existing locked dependencies were installed with `npm ci` at repo root and `apps/vacation-client`; manifests/locks are unchanged. Initial local runs found absent dependencies, an absent default Chrome path, host GBrain CLI affecting the expected bundled-rules path, then absent `pdftotext`. Those attempts are retained in `saved-patch-keepsake.log`, `offline-tests.log`, `offline-tests-browser.log` and `offline-tests-ci-path.log`.

The final full-suite attempt used the documented existing host environment, without system changes:

```sh
source /home/ubishere9995/tsv-dispatch/ruling95-20261017/r102c/ci-env.sh
export PUPPETEER_EXECUTABLE_PATH=/home/ubishere9995/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
node scripts/run-offline-tests.mjs
```

The host environment selects the installed Chromium and existing Snap PDF wrappers/Python libraries, and excludes GBrain CLI from the offline-test PATH to match CI's bundled-rules expectation. GBrain source: `bot-admin/receipts/eggbot-vk-ruling102-claude-window`; local copy `pdf-tools-route.txt`. No tests were changed, skipped or loosened to resolve these environment requirements.

## Exact stop condition and route checked

BLOCKED at starting HEAD `78cadd20e8c8829635f889465efa69db11a0fbee` plus source-only patch `3347e9c03b6c5dc99018f6e20265537b5eb2dcdef5ce3c22f92e5a4b32534606`: the unchanged full-suite harness tried to create a source-producer directory outside the supplied worktree/job roots.

- Test: `scripts/test_same_selection_capture.mjs` -> `scripts/ops/dispatch/test_same_selection_capture.py`.
- First failing case: `NodePrepareCallerBindingTests.test_node_prepare_binds_fixture_producer_and_render_heads`.
- First error: `OSError: [Errno 30] Read-only file system: '/home/ubishere9995/tsv-dispatch/pr-src/capture-producer-roots'`.
- Exact failed source path: `/home/ubishere9995/tsv-dispatch/pr-src/capture-producer-roots`.
- Write attempted by unchanged `scripts/ops/dispatch/capture_replay_binding.py:210`, `root.parent.mkdir(parents=True, exist_ok=True)`.
- A second case (`ProducerAndCacheTests.setUpClass`) reported the same path; six harness tests ran with two errors. The suite stopped at its 94th manifest entry; it was not green.
- Access route checked before this verdict: GBrain `bot-admin/lanes/vk-pr-handoff/pr-660`; `gbrain search '"capture-producer-roots"'`; resulting page `bot-admin/requests/lane-dispatch-adapter-root-fix-20261017` (local `capture-root-route.txt`). The page records host-owned runtime/tooling boundaries; it does not grant this job write access. The runner explicitly requires stopping after a source-write failure. No alternate-root retry, permission change or protected-path repair was attempted.

## Host action / close verdict

Do not mark PR #660 eligible or close it as successful from this receipt. Preserve this uncommitted candidate for review. The host/managing dr must resolve the test harness's source-producer execution context under the existing ownership rules and complete all 292 offline tests, then own any commit/single push/PR update and exact-new-head CI + authorized Gate B structure/price-coverage acceptance. No new capture round or gate reset was consumed by this job. NYC reference images are historical, not approved baselines; no screenshot or live/PDF acceptance is claimed.

The code change addresses the authorized assertion failure locally; the mandatory full-suite gate remains unmet for the exact error above. No written close-as-unneeded verdict is justified by the evidence.
