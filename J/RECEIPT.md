# vkfill-989 host receipt (cursor-ubuntu composer-2.5, invariant relaunch)

**Start HEAD:** `36873572607725b1f3800aa0dcc6834f76a09314` (verified `git rev-parse HEAD`)  
**Outcome:** `source-ready` for host publication (#989 / PR #991).  
**CI target:** red `accept` (`itinerary-paint-budget` harness failure on `b4882713`; ref `tsv-dispatch/acceptance/reports/989-b488271/report.json`).

**Base merge:** host merged `origin/vk` at `01521be4d13e309d417ff7ff8ccda3b2d27d234a` into start HEAD; conflicts resolved in `J/RECEIPT.md`, `scripts/offline-tests.txt` (both sides' offline entries retained).

## Root cause (accept)

Host acceptance runner invokes `scripts/test_acceptance_989_itinerary_load_latency.mjs` → `test_issue_989_shared_trip_load.mjs` (latency slice). Puppeteer launched with fallback `executablePath` `/usr/local/bin/google-chrome`, which is absent on the accept Ubuntu host (`Browser was not found at the configured executablePath`). The dossier and fetch-once assertions already passed on the same head.

## Fix (this round)

`scripts/test_issue_989_shared_trip_load.mjs` — align Chromium resolution with `scripts/test_acceptance_984_add_place_latency.mjs`: `CHROME_PATH || PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'`. Latency medians unchanged (local: cold median 283ms, warm median 224ms).

## Merge resolution (uncommitted — host commits + pushes)

| Path | Role |
| --- | --- |
| `scripts/offline-tests.txt` | Union: #988 `test_acceptance_988_no_summary_details_fallback.mjs` + #989 acceptance trio |
| `J/RECEIPT.md` | PR receipt + base-merge note |
| `scripts/test_issue_989_shared_trip_load.mjs` | Puppeteer `executablePath` fallback for accept harness (prior round) |

## Pre-DONE (start HEAD `36873572`, dirty merge tree)

| Check | Result |
| --- | --- |
| `cd apps/vacation-client && npm test` | pass (after root `npm ci`) |
| `node scripts/rebake_served_trek_bundle.mjs` | pass sha256=cca904a6… |
| `node scripts/test_offline_manifest.mjs` | pass (468 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_acceptance_988_no_summary_details_fallback.mjs` | pass |
| `node scripts/test_acceptance_989_shared_payload_omits_dossier.mjs` | pass |
| `node scripts/test_acceptance_989_payload_fetch_once.mjs` | pass |
| `node scripts/test_acceptance_989_itinerary_load_latency.mjs` | pass (coldMedian 264ms, warmMedian 269ms) |

No commit, stage, push, merge, rebase or deploy in this lane (HOST PUBLICATION ONLY).

## Uncommitted paths (host stages)

- `J/RECEIPT.md`, `J/PR_DESCRIPTION.md`, `scripts/offline-tests.txt` (conflicts resolved)
- Merge staged: `scripts/test_acceptance_988_no_summary_details_fallback.mjs`, four `src/vacation/*` enrichment files
- Prior round (if not already on tip): `scripts/test_issue_989_shared_trip_load.mjs` chromium path

## Host next

`git add J/RECEIPT.md J/PR_DESCRIPTION.md scripts/offline-tests.txt`; `git commit --no-edit` merge; push `vkfill/989-auto-242609ec`; wait CI `unit-tests` + `secrets` + `accept` + `gateb` green on new head (PR #991).