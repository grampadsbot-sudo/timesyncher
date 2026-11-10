# PR #907 / #903 — host base-merge follow-up (cb4638cf)

**Outcome:** source-ready PATCH (uncommitted conflict resolution; HOST PUBLICATION ONLY). **Start HEAD:** `cb4638cf83d22a66899bdee02333545759b574c8` (verified).

Host merged `origin/vk` at `85fae5b37a899e737b570b71d052def772d42b16` into `cb4638cf`. Conflicted: `J/RECEIPT.md`, `scripts/offline-tests.txt`. This round resolved both (both sides kept).

## #903 / #907 product (HEAD side, on branch)

Seven live-QA polish checkers in `scripts/test_issue_903_live_qa_polish.mjs` + `src/vacation/live-qa-903-presentation.mjs`, `src/vacation/trek-qa-903-ui-patch.mjs` (wired in `trek-style2-bundle.mjs`).

**#832 interaction (item 7):** `applyFlightTitleTimes` backfills override times from titled clock ranges for all flights; strips title clock ranges only when the title is Southwest-branded (`southwestBrandedFlightTitle`).

## Vk merge (staged index; inherited #901 / #905 / vk)

| area | note |
| --- | --- |
| `scripts/test_issue_901_trip99_single_venue_standins.mjs` | registered in `offline-tests.txt` alongside #903 test |
| Trip 99 fixtures / `J/trip99-change.*` | Host Neon apply path per prior #908 receipt |
| #905 port pieces | chat-itinerary, `vacation-app.html` composer catch, etc. on staged index |

**Served bundle:** `node scripts/rebake_served_trek_bundle.mjs` after vk `public/assets` (see checks).

## Checks @ `cb4638cf` + conflict resolution

| check | result |
| --- | --- |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (sha256=7afd665f…; no extra `public/assets` diff vs staged index) |
| `node scripts/check-no-comments.mjs` | PASS (1131 files; `apps/vacation-client/npm ci` first) |
| `node scripts/test_offline_manifest.mjs` | PASS (437 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

## Host publish

1. Stage resolved `J/RECEIPT.md`, `scripts/offline-tests.txt`; complete merge commit if index still MERGING; push once to `vkfill/903-20261109163214`.
2. CI `unit-tests`, then Gate B structure on new head (watch DATA FAULT stale replay on places[57] per handoff `bot-admin/lanes/vk-pr-handoff/pr-907`).

**Uncommitted / staged (host):**

- Merge in progress (`git commit` to conclude): staged index from vk (~15 paths shown at round end) plus conflict fixes below.
- **Unmerged → resolved (host `git add`):** `J/RECEIPT.md`, `scripts/offline-tests.txt`.
- **Unstaged editor fix:** `J/PR_DESCRIPTION.md` (#907 conflict round blurb).
- **No new product code** this round; #903 presentation already on `cb4638cf`.
