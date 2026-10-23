# Issue #645 — blocked (2026-10-23)

**Start sha:** `5ee5bb95586ab1d588b3dba7d2d116054f0296b7` (matches `migrate/trek-source` at lane launch)

## Blocker

Issue #645 depends on #641, #643, and #644. Per issue body and sequence (#641 → #643/#644 → #645), this lane stops here with **no product or dossier rollout code** until all three dependencies are merged into `migrate/trek-source`.

| Issue | State (GitHub API 2026-10-23) | Title |
| --- | --- | --- |
| #641 | OPEN | VK reviews: map review-set ids to dossier pages for claim support, meaning-based description judge, Brave coverage (round 5 findings) |
| #643 | OPEN | VK hours + happy hours built from each Thing's evidence file, every claim supported |
| #644 | OPEN | VK price estimate built from each Thing's evidence file, labelled as an estimate (never blocks) |

Commands: `gh issue view 641 --json state` → OPEN; same for 643 and 644.

## Work performed

- Confirmed branch `cursor/tsv-645-vk-text-rollout-to-all-things-on-the-live-staging-trip-evidence-file-description-review-1350` is at start sha with no ahead commits.
- No evidence-file batch, xAI spend, staging DB writes, or renderer changes (blocked).

## Not claimed

- Green CI on a functional #645 head, Gate B PASS, `live_accept` on live staging, per-Thing xAI costs, or merge eligibility.

---

# PR #632 / issue #631 — cursor-ubuntu pass (2026-10-22)

**Start sha:** `bb8be14dc9a34ac54148f804136f4f34f89a68e5`

## Changes (host verdict 6349028367 follow-up)

- Aligned `scripts/test_dossier_refresh_integration.mjs` with claims-based dossier fixtures; mock `judgeImpl` / `extractReviewsImpl` so offline runs need no `XAI_PLACE_SEARCH_MODEL`.
- Removed comment violations across dossier modules (repo no-comment gate); reworded builder prompt (`must say` → `should state`).
- `dossier-cost.mjs`: lazy place-search rate lookup (no bare model literal at module load); ratchet-clean.
- `dossier-brave.mjs`: Brave API root from `poi-search.mjs` (`BRAVE_SEARCH_RES_V1`); `placeCoords` no longer exported dead.
- `thing-evidence-dossier.mjs`: dossier gather helpers kept module-private for DEAD-CODE ratchet.
- Registered `scripts/test_dossier_round5.mjs` in `scripts/offline-tests.txt`.

## Pre-DONE gates (local)

| Command | Result |
| --- | --- |
| `node scripts/test_thing_evidence_dossier.mjs` | pass |
| `node scripts/test_dossier_refresh_integration.mjs` | pass |
| `node scripts/test_dossier_round5.mjs` | pass |
| `node scripts/test_check_hardcoded_content.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass (0 fail) |

## Not claimed

- Green CI on pushed head, Gate B 32/32, staging dossier batch with live keys, or `live_accept` — host publish + acceptance only.


---

# PR #632 / issue #631 — host publication handoff

Outcome: source-ready, uncommitted for host review; starting HEAD `eb8455fa36d5243c52f7839d166547a088bb7859` verified before edits and unchanged. This is not a green-CI or merge-eligibility claim.

## Governing evidence

- GBrain `bot-admin/lanes/vk-pr-handoff/pr-632` and `bot-admin/receipts/gpt-manager-pass-20261022-1521` read through the local gbrain CLI. Current PR/issue comments and holds saved as `issue-632.json`, `issue-631.json`, `issue-628.json` in this job directory.
- Exact starting-head CI run [39865851072](https://github.com/grampadsbot-sudo/timesyncher/actions/runs/39865851072): unit-tests job `120127726739` and secrets job `120127726694` first error is `MODEL-BARE scripts/test_dossier_round5.mjs:64 grok-4.3`. Both complete logs saved locally. Earlier six-ratchet/five-hardcoded diagnosis was for older `bb8be14d`; local reproduction on `eb8455fa36d5243c52f7839d166547a088bb7859` shows only this remaining model literal. Ratchet already reports zero new failures.
- Canonical data page `skills/vk-thing-data-contract/skill` read, with later binding issue comments `6346704181`, `6347521496`, `6349748310` taking precedence. Raw `get_skill` returned `skill_not_found`, authorized skill catalog empty; canonical page remained accessible. No access or missing-key blocker is claimed.
- Applied GBrain `skills/tsv-engineer-pr-process/skill`; test-only changes skip screenshot steps 4–5 under its Scope section. Loaded keepsake/verification and required SoT pages. No screenshot or Gate B round authorized or run.

## Change and reason

`scripts/test_dossier_round5.mjs` now resolves the model through the existing `xaiGrokPlaceSearchModelId` accessor using an explicit local test configuration. The four cost/log calls use that configured ID. All existing assertions, expected USD totals, review checks and evidence checks are preserved. No scanner exceptions, identifier splitting, new test files, product-data edits or runtime behavior changes.

## Local verification

All results below apply to starting HEAD `eb8455fa36d5243c52f7839d166547a088bb7859` plus the uncommitted test diff; logs are in this job directory.

| Command | Result and evidence |
| --- | --- |
| `node scripts/test_dossier_round5.mjs` | Exit 0; `round5-final.log`; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |
| `node scripts/test_thing_evidence_dossier.mjs` | Exit 0; `dossier-final.log`; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |
| `node scripts/test_dossier_refresh_integration.mjs` | Exit 0; `refresh-final.log`; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |
| `npm run test:keepsake-style2` | Exit 0; `keepsake-final.log`; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |
| `node scripts/test_check_hardcoded_content.mjs` | Exit 0; `hardcoded.log`; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |
| `node scripts/check-no-comments.mjs` | Exit 0, 844 files; `no-comments-final.log`; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |
| `node scripts/test_offline_manifest.mjs` | Exit 0, 288 offline / 17 online; `manifest.log`; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | Exit 0, 255 report / 0 fail; `ratchet.log`; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |
| `git diff --check` | Exit 0; `eb8455fa36d5243c52f7839d166547a088bb7859` + diff |

The initial dossier/no-comments attempts stopped on missing local Neon/TypeScript packages. Installed existing locked root and client dependencies with `npm ci --ignore-scripts --no-audit --no-fund`, cache confined to this job directory; final checks above then executed successfully. No package or lockfile source edits.

## Host-owned next step and retained boundaries

Host reviews the uncommitted patch, publishes through the existing PR branch, and obtains green CI on that exact published head. PR #632 is still awaiting that acceptance; no CI restart/retrigger or external publication was performed. No commit, stage, push, merge, rebase, Git metadata write/probe, deploy, model-provider call, live DB write, quota reset, Gate B claim or Craig message. Existing holds and guards remain untouched. No new feature, production pricing-policy repair or adapter refactor was added to the single remaining exact-head failure scope.

Prepared PR description: `PR-DESCRIPTION.md`. Source patch: `source.patch`. Receipt copy: `J/RECEIPT.md` in this job directory.
