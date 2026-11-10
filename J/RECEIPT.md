# PR #907 / Issue #903 — post–vk-base-merge CI fix (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready (uncommitted patch; host push). **Start HEAD:** `9461cd7898ae1d02d9d365fcb6b6e744f34c2ed4`.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-907` — page_not_found (noted per brief).

## Host base merge (retained)

Host merged `origin/vk` at `d9b60879c1ab28aac0a1c5939e5e56fd178ed6ce` into `9461cd7898ae1d02d9d365fcb6b6e744f34c2ed4`. Non-receipt vk deltas remain staged: dossier overlay / intake address specificity (#889), fixtures, offline manifest rows, layout harness tests, etc. (see `git status`).

## This round — CI unit-tests (#832 vs #903)

Live CI on `9461cd78` failed `scripts/test_issue_832_day_timeline_binding.mjs`: `prepareSharedTripForLiveApp` stripped clock times from catalog flight names (e.g. `Delta LAS-JFK 2026-06-23 07:05-15:13` → date-only), while #832 expects stored names to pass through when there is no prefix repair.

**Root cause:** `applyFlightTitleTimes` in `src/vacation/live-qa-903-presentation.mjs` always stripped `HH:MM` ranges. #903 still requires titles without embedded clocks when structured timing exists on the Thing (zoned time chip / `departureTime`).

**Fix:** Gate clock stripping on `flightHasStructuredTimes()` (override `departureTime` / `arrivalTime` / `start_time` / `end_time`, or place `place_time` / `start_time` / `end_time`). Bare catalog rows without timing metadata keep stored names; assigned Southwest rows with `departureTime` still strip clocks for #903.

## #903 acceptance (inherited on branch)

Seven polish items remain covered by `scripts/test_issue_903_live_qa_polish.mjs` and product files on HEAD (fullscreen chrome, borrowed ratings, star/text alignment, detail chrome patch, trip-month hours, jargon/upsell, flight title times when structured timing present). `#836` chrome wait already targets `Priceline Express Deal` on HEAD.

## Checks run @ `9461cd78` + local patch

| Check | Result |
| --- | --- |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (434 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

## Uncommitted files (host)

- `src/vacation/live-qa-903-presentation.mjs` (flight title time guard)
- `J/RECEIPT.md` (this file; resolve merge conflict vs vk receipt)
- Plus staged host merge index from vk (not committed by lane)

## Host follow-up

- Finish merge commit for vk + this patch; one push to `vkfill/903-20261109163214`.
- Rebake served bundle if `public/assets/*.js` conflict policy applies post-merge.
- Gate B / live screenshots — not self-certified here.
- Do not commit root or `apps/vacation-client/node_modules` from local `npm install`.

## Not touched (scope)

Baselines, Gate B capture config, `.github/` workflows, `package.json` / lock, deploy config, NYC reference PNGs. No test edits.
