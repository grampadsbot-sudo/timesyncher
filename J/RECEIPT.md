# PR687 host handoff

Outcome: source-ready for host review; uncommitted changes only. PR completion, publication, data acceptance and CI success are not claimed. Reference: starting and current HEAD `c71dc06e2404837c4742c783662e54ef183a0370`; source patch SHA256 `ab8925df09144f94487391ada7df1b16438f104365cbab7a31cc2cf3d3e4a6b0`.

Model: gpt-6.1-sol. One agent; no delegation, other model calls, paid provider runs or credential extraction. Git metadata was not changed. No stage, commit, push, merge, rebase, deployment or remote messages.

## Authority and scope

Read current GBrain `bot-admin/lanes/vk-pr-handoff/pr-687`, `bot-admin/messages/time-syncher/decisions-log` (#60/#61), `bot-admin/messages/time-syncher/eggbot-thing-dossier-central-db-nyc-20261025`, governing request `bot-admin/messages/time-syncher/eggbot-chief-687-passb-fill-now-20261025-2142`, the required repository SoTs, and the engineer, Thing data, keepsake QA and Vacation verification skill pages. CLI `gbrain get` succeeded; the published-skill catalog route returned no entries, so the existing skill pages supplied the instructions.

Verified PR687 branch/head and base `migrate/trek-source` through read-only GitHub API; inspected its latest comments. Retained every ownership hold and quota/round requirement. The newest handoff scopes this source round to the cumulative dossier builder, with no Gate B pixel round. No UI/rendering or PR693 change, screenshot, pstack, SCT or QA launch.

## Source changes

- `scripts/build_nyc_thing_evidence_dossiers.mjs` derives its targets from the existing inventory instead of the nine-place constant: 94 targets (22 hotels, 16 flights, 15 stores, 15 attractions/events, 25 restaurants, one car). It preserves each target's source metadata, coordinates, address and trip identity. CLI preflight rejects missing xAI key/model or Brave configuration before storage/search mutations; it does not load or print credentials.
- The existing dossier store now supports shared dossiers for matching title/category/address/URL identities and trip references to those dossiers. The inventory runner opts shared types into this path; flights/cars retain trip keys. Shared dossiers retain cumulative captured pages/attempts and unique trip IDs/use count. Legacy trip captures migrate into the shared record. Async and disk readers follow trip references; writes through references update the shared record.
- Gap top-ups reserve and checkpoint each numbered attempt in `attempts[]`, count earlier attempts/legacy shortcomings and enforce at most three per missing field across resumes. New web/page/gap events carry timestamps. Saved zero-page attempts resume gap work without repeating the full initial gather.
- Initial gather preserves shared metadata. Saved-review rebuild now receives the dossier after top-ups, preserving those pages and retry reservations.
- Extended three existing classified tests; no new test file or manifest edit. Added full inventory coverage, alternate input coverage, shared reuse/trip counts, flight/car isolation, disk-reference reading, preflight-before-mutation, legacy retry budgets, interrupted reservations, empty-capture resume and saved-review ledger checks.

## Verification on the uncommitted source at c71dc06e2404837c4742c783662e54ef183a0370

All 15 focused checks exited 0; exact commands/results are in `/home/ubishere9995/tsv-work/vkfill-687-20261025215805-job/test-results.json` and per-test logs. These include the dossier data batch, evidence682, worker route, refresh integration, retry682, reviews/identity682, hydration682, staging fixes682, base dossier, rejected claims/shortcomings682, cost682, fixture overlay, keepsake style2, bundle strip and served bundle checks.

Final gates exited 0: `node scripts/check-no-comments.mjs` (898 files), `node scripts/test_offline_manifest.mjs` (310 offline/17 online), `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` (255 reports/0 failures), and `git diff --check`. Logs and exit codes: `/home/ubishere9995/tsv-work/vkfill-687-20261025215805-job/gate-results.json`.

Baseline proof: loading the unchanged starting-HEAD top-up/count modules into the same new behavioral test fails with `3 !== 1` at "two saved failures leave only one search". Current code passes. See `/home/ubishere9995/tsv-work/vkfill-687-20261025215805-job/baseline-topup-regression.log`.

The supplied worktree lacks installed Neon/TypeScript dependencies. Initial direct test/check attempts failed with module-not-found. Tests then used the read-only dependency resolver `/home/ubishere9995/tsv-work/vkfill-687-20261025215805-job/dependency-resolver.mjs` against the existing `vkfill-693-20261024164917` dependency installation. Both root and client package-lock files are byte-identical to this worktree. No dependency/package/lock/checker file was modified; only dependency resolution changed for local execution. This setup is not a CI pass claim.

## CI and remaining host work

Existing starting-head CI is red: run `40271625366`, job `121405479970`, `unit-tests`; also run `40271620901`, job `121405466831`. First failure annotation: `Process completed with exit code 1.` Underlying test assertion: not found in the accessible annotations. Read-only job-log GET `/repos/grampadsbot-sudo/timesyncher/actions/jobs/121405479970/logs` returned HTTP 403; no credential/privilege retry was attempted. Evidence: `github-final-checks.json`, `github-annotations-121405479970.json`, `ci-log-read-error.txt`. PR comment `6408658061` reports the stopped CI loop; current issue labels are `status:stuck` and `needs-dr-eggbot`. No CI rerun, guard reset, label change or speculative CI fix.

Host owns review, Git publication and any targeted CI diagnosis. The credential route checked is the current handoff's sanctioned vacation runtime loader (Vercel env), with the repo provider-name contract in `src/vacation/provider-env.mjs`. This runner explicitly forbids credential extraction/other models; no host credential availability claim is made. Host must perform the sanctioned credentialed run and evaluate actual by-type present/presented results, >=80% by type and Craig's sample. This round produces source only: no real capture, central production import, synthetic seed acceptance, live build or present/presented acceptance. The shared binding is opt-in for this inventory runner; this round does not claim all other capture entry points have been migrated.

Review artifacts: `/home/ubishere9995/tsv-work/vkfill-687-20261025215805-job/SOURCE-CHANGES.patch`, this receipt and `J/PR_DESCRIPTION.md`. GBrain filing and PR-description publication remain with the host. No source write failed.
