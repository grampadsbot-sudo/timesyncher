# Issue #641 — source handback

Actual starting HEAD: `39e5c83507f25a11c948b793301bfa8164a3dda3` (the required start commit).
Model: gpt-6.1-sol. One worker; no subagents or paid model calls.

Verdict: blocked on host publication and live acceptance, starting HEAD `39e5c83507f25a11c948b793301bfa8164a3dda3`. Source/test changes are uncommitted for host review. Do not close #641 from these local checks.

## Changes and existing work

The supplied base already contains #641 PR #647, merged at `230d55b4`, implementation `8ecdb5087b4b8ec091847eb49475bdb5afafeab9`. It already carries source page ids on extracted reviews, resolves rN to pN before judging, rejects unresolvable ids, instructs the independent judge to check meaning, and threads coordinate/trip centers to Brave. Those existing changes were retained.

This handback adds:

- `src/vacation/dossier-brave.mjs`: a 404 from coordinate-based place_search now permits the existing web-locations lookup. Previously the shared catch returned early. Each failure records its actual lookup step. Authentication, authorization, and rate-limit errors still stop without another request.
- `scripts/test_dossier_round5.mjs`: regressions for that 404 fallback, one-request behavior for 401/403/429, each supported coordinate source without a masking fallback center, and review page ids surviving extraction and prompt compaction.
- `scripts/test_thing_evidence_dossier.mjs`: exact Arthouse and Rosa round-5 claim texts and saved page excerpts, semantic judge prompt/response plumbing, contradicted claims, and mixed valid-page/unresolvable-review citations. Rosa's original p12/p13 are reindexed p1/p2 in the isolated unit inputs; r7/r8 and the claim text are retained. Existing fixture/snapshot files were not edited.

The judge responses in the new tests are explicitly mocked. They prove prompt/citation/response handling, not a live model's semantic accuracy.

## Brave investigation

Source: `/home/ubishere9995/run10-20261022/out5/*.json`, with input SHA256s and selected diagnostics saved in `/home/ubishere9995/tsv-work/vkfill-641-20261022210748-job/evidence-investigation.json`.

Nine Things recorded web local_search success with zero locations, followed by no_match. Only Rosa recorded locations (9) and a POI page, containing a rating and zero embedded reviews. These records show no HTTP authentication, plan, or rate-limit error; key/plan scope cannot be inferred from an empty successful response. No credential values were inspected or printed.

The round-5 harness omitted coordinates/trip center, so it could not use coordinate place_search. Query construction and center plumbing were already corrected in base implementation `8ecdb508`. The new tests verify the destination-qualified query and center sources. The 404 early-return defect was additionally reproduced locally: the regression returned zero pages before the source fix and one afterward. It is not asserted to be the observed cause of round 5's empty results.

Tavily dedup cannot explain the nine failures: they had no matching Brave location before POI fetch. Rosa's one Brave page survived dedup. Existing same-URL dedup behavior was left unchanged.

## Local verification

All exit statuses below are 0 for the uncommitted patch on starting HEAD `39e5c83507f25a11c948b793301bfa8164a3dda3`. Logs are in `/home/ubishere9995/tsv-work/vkfill-641-20261022210748-job`.

| Command | Log |
| --- | --- |
| `node scripts/test_dossier_round5.mjs` | `dossier-round5.log` |
| `node scripts/test_thing_evidence_dossier.mjs` | `dossier-evidence.log` |
| `node scripts/test_dossier_refresh_integration.mjs` | `dossier-refresh.log` |
| `node scripts/test_dossier_hours_happy_hour.mjs` | `dossier-hours.log` |
| `npm run test:keepsake-style2` | `keepsake.log` |
| `TIMESYNCHER_BUILD_SHA=39e5c83507f25a11c948b793301bfa8164a3dda3 npm run build` | `build.log` |
| `node scripts/check-no-comments.mjs` | `no-comments.log` |
| `node scripts/test_offline_manifest.mjs` | `offline-manifest.log` |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | `code-ratchet.log` |

No new test file was added. The manifest remains unchanged. The ratchet reports 0 failures. `git diff --check` also exited 0. Root and client dependencies were installed from existing locks with lifecycle scripts disabled; manifests and locks are unchanged.

Initial local setup/check failures are retained in `build.initial.log`, `no-comments.initial.log`, and `code-ratchet.initial.log`: absent build SHA, absent locked client TypeScript, and an unawaited test-mock call flagged by the ratchet. These were addressed through the documented build environment, locked dependency installation, and explicit await in the test. No check was changed. No CI was run or retriggered.

## Live acceptance and cost

No fresh live run10 was executed for this patch. Saved prior #641 results in `/home/ubishere9995/run10-20261022/out641a` and `ev641a.txt` report descriptions 10/10, but only Arthouse and Smith meet the numeric review-breadth minimum. Both still have limited-review labels. Those historical results do not satisfy this issue's review acceptance and do not verify this uncommitted patch.

The eight prior breadth gaps are Blue Note (2 sources), Carbone (1), Empire (5 reviews), Pod (1 source), Rosa (8 reviews), Strand (9 reviews), Vanguard (1 source), and Zabar's (2 sources). These gaps require missing saved evidence, never invented summaries or lowered checks.

| Thing | Prior #641 xAI USD | Prior reviews / sources | This worker xAI USD |
| --- | ---: | ---: | ---: |
| arthouse | 0.039337 | 24 / 6 | 0.000000 |
| bluenote | 0.042428 | 23 / 2 | 0.000000 |
| carbone | 0.044763 | 31 / 1 | 0.000000 |
| empire | 0.033826 | 5 / 3 | 0.000000 |
| pod | 0.039271 | 28 / 1 | 0.000000 |
| rosa | 0.034614 | 8 / 4 | 0.000000 |
| smith | 0.034795 | 12 / 5 | 0.000000 |
| strand | 0.030451 | 9 / 5 | 0.000000 |
| vanguard | 0.044805 | 31 / 1 | 0.000000 |
| zabars | 0.041665 | 28 / 2 | 0.000000 |

This worker spent $0.00 on xAI. The historical #641 total is $0.385955. A cross-lane overnight total was not established from these per-run files, so no additional paid runs were initiated. Saved evidence files and staging aliases were not changed.

## Exact remaining requirements and authority

The current runner reserves commits, push, PR creation, and publication to the outer host and prohibits deployment; it also permits only gpt-6.1-sol in this worker. Therefore no commit, push, stage, Git metadata mutation/probe, merge, deploy, temporary route, live grok run, or external message was attempted. CI green on a PR head, equal-tip live run10, full review acceptance, and any required Gate B verdict remain unverified.

GBrain access was checked successfully with `gbrain get skills/tsv-engineer-pr-process/skill`, `gbrain get skills/vk-thing-data-contract/skill`, `gbrain get skills/timesyncher-vacation-verification/skill`, `gbrain get skills/keepsake-qa/skill`, and `gbrain get bot-admin/messages/time-syncher/decisions-log`. Copies are in the job directory. This is an ownership/acceptance handback, not a missing-access or missing-key claim. The PR-process page's step 2 also assigns deployment to the owning deploy agent. No prohibited operation was attempted to manufacture an access failure.

Host review: apply the uncommitted source/test patch, publish once into `migrate/trek-source`, use `/home/ubishere9995/tsv-work/vkfill-641-20261022210748-job/PR_DESCRIPTION.md` (contains `Closes #641`), and retain draft/acceptance holds until CI and live evidence meet the brief. No layout or render code changed; no screenshot or Gate B result is claimed. No UI claim or new Feature Map behavior is introduced.
