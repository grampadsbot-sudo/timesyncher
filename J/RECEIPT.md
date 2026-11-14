# vkfill-989 host receipt (cursor-ubuntu composer-2.5, invariant relaunch)

**Start HEAD:** `b4882713e2d25cffd742802fda1158d974b9f01d` (verified `git rev-parse HEAD`)  
**Outcome:** `source-ready` for host publication (#989 / PR #991).  
**CI target:** red `accept` (`itinerary-paint-budget` harness failure on `b4882713`; ref `tsv-dispatch/acceptance/reports/989-b488271/report.json`).

## Root cause (accept)

Host acceptance runner invokes `scripts/test_acceptance_989_itinerary_load_latency.mjs` → `test_issue_989_shared_trip_load.mjs` (latency slice). Puppeteer launched with fallback `executablePath` `/usr/local/bin/google-chrome`, which is absent on the accept Ubuntu host (`Browser was not found at the configured executablePath`). The dossier and fetch-once assertions already passed on the same head.

## Fix (this round)

`scripts/test_issue_989_shared_trip_load.mjs` — align Chromium resolution with `scripts/test_acceptance_984_add_place_latency.mjs`: `CHROME_PATH || PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'`. Latency medians unchanged (local: cold median 283ms, warm median 224ms).

## Changed files (uncommitted — host commits + pushes)

| Path | Role |
| --- | --- |
| `scripts/test_issue_989_shared_trip_load.mjs` | Puppeteer `executablePath` fallback for accept harness |
| `J/RECEIPT.md` | Host handoff |

## Pre-DONE (start HEAD `b4882713`, dirty tree)

| Check | Result |
| --- | --- |
| `node scripts/test_offline_manifest.mjs` | pass (467 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (0 fail) |
| `node scripts/test_acceptance_989_shared_payload_omits_dossier.mjs` | pass |
| `node scripts/test_acceptance_989_payload_fetch_once.mjs` | pass |
| `node scripts/test_acceptance_989_itinerary_load_latency.mjs` | pass (coldMedian 283ms, warmMedian 224ms) |

No commit, stage, push, merge, rebase or deploy in this lane (HOST PUBLICATION ONLY).

## Host next

Commit dirty paths on `vkfill/989-auto-242609ec`; push; wait CI `unit-tests` + `secrets` + `accept` + `gateb` green on new head (PR #991).