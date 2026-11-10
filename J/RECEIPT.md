# Issue #903 / PR #907 — P2 live QA polish (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready (uncommitted patch; host push). **Start HEAD:** `efa8ab1f0c7863a259557b99f9090e738d958fc3`.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-907` — page_not_found (noted per brief).

## This round

CI **unit-tests** failed on `scripts/test_issue_836_budget_flights_chrome.mjs` (120s wait for `Priceline opaque` body text). #903 presentation (`prepareSharedTripForLiveApp` / `live-qa-903-presentation.mjs`) already rewrites customer-visible car copy to **Priceline Express Deal**; `apps/vacation-client/test/day-layout.mjs` was updated in a prior host publish but #836 was not.

**Fix:** Cars-tab wait in `scripts/test_issue_836_budget_flights_chrome.mjs` → `/Priceline Express Deal/i` (same contract as day-layout).

## Inherited #903 product (already on `efa8ab1f`)

Seven acceptance items documented in prior receipt: fullscreen button, borrowed ratings, star/text alignment, detail chrome, trip-month hours, jargon/upsell, flight titles without clock times — `scripts/test_issue_903_live_qa_polish.mjs`.

## Checks run (lane, after patch)

| Check | Result |
| --- | --- |
| `node scripts/test_issue_836_budget_flights_chrome.mjs` | PASS |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (432 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-hardcoded-content.mjs` | PASS (88 report, 0 fail) |

## Uncommitted files (host)

- `scripts/test_issue_836_budget_flights_chrome.mjs` (1-line wait string)

## Host follow-up

- Commit + push to `vkfill/903-20261109163214` (one push); CI unit-tests should clear on #836.
- Gate B / live screenshots — not self-certified here.
- Do not commit root `npm install` / `apps/vacation-client/node_modules` churn.

## Not touched

Baselines, Gate B config, `.github/`, `package.json` / lock, NYC fixture bodies, deploy config, evidence PNGs (reverted local screenshot drift).
