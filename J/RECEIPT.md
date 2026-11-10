# PR #907 / #903 — CI unit-tests (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready (uncommitted patch; host push). **Start HEAD:** `cbc8b5b831fc0b019c0271bb09f34fd0956ddcc6`.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-907` — page_not_found (noted per brief).

## This round

Live CI on `cbc8b5b8` failed `scripts/test_issue_832_day_timeline_binding.mjs`: stored Delta catalog name lost embedded `07:05-15:13` in `prepareSharedTripForLiveApp`.

**Root cause:** `#903` item 7 `applyFlightTitleTimes` stripped clock ranges from every flight title; chief brief item 7 targets Southwest-branded titles only; #832 requires non-Southwest stored names to pass through unchanged.

**Fix:** `src/vacation/live-qa-903-presentation.mjs` — backfill override times from titled ranges for all flights; strip title clock ranges only when the title is Southwest-branded.

## Checks @ `cbc8b5b8` + patch

| Check | Result |
| --- | --- |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Host

Uncommitted: `src/vacation/live-qa-903-presentation.mjs`, `J/RECEIPT.md`. One commit + push to `vkfill/903-20261109163214`.
