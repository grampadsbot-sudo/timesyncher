# PR #907 / Issue #903 — vk base merge + CI unit-tests (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready (uncommitted patch; host push). **Start HEAD:** `30bfe48d950e97325681a213a41840334dc53efc`.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-907` — page_not_found (noted per brief).

## Host base merge

Host merged `origin/vk` into `30bfe48d950e97325681a213a41840334dc53efc` (see `basemerge.json` in job dir). Conflicts resolved in source:

- `src/vacation/trek-style2-bundle.mjs` — chain **both** `patchVk890Rebrand` and `patchUi903DetailChrome` (vk rebrand + #903 detail chrome).
- `public/assets/index-BKun7ofk.js` — took `origin/vk` served asset, then `node scripts/rebake_served_trek_bundle.mjs` (sha256 `7afd665f3b75cb37e4aa2ba85b4d2043d6ef08a1dbec93725c1c3b5bc6417c8b`).

## This round — CI unit-tests

Live CI on `30bfe48d` failed `scripts/test_shared_tab_list_summary.mjs`: fixture car rows still asserted `Priceline opaque` after `applyLiveQa903Presentation` (#903 jargon item 6).

**Fix:** Align offline assertions with served customer copy (`Priceline Express Deal (car company shown after booking)`), and compare pr336 snapshot binding through `sanitizeCustomerJargon()` in `scripts/test_gate_b_product_row_fields.mjs` so raw snapshot titles are not compared to sanitized live names.

## #903 acceptance (inherited)

Seven polish items remain covered by `scripts/test_issue_903_live_qa_polish.mjs` on this patch. #890 vk rebrand patches retained in trek rebake chain.

## Checks run @ `30bfe48d` + local patch

| Check | Result |
| --- | --- |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (435 offline) |
| `node scripts/check-no-comments.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `npm run test:keepsake-style2` | PASS |

## Uncommitted files (host)

- `src/vacation/trek-style2-bundle.mjs`
- `public/assets/index-BKun7ofk.js` (rebaked)
- `scripts/test_shared_tab_list_summary.mjs`
- `scripts/test_gate_b_product_row_fields.mjs`
- `scripts/test_shared_trip_live_tab_logos.mjs`
- `J/RECEIPT.md`

Host: finish merge commit, one push to `vkfill/903-20261109163214`. Gate B / live screenshots — not self-certified here.

## Not touched (scope)

Baselines, `scripts/offline-tests.txt`, Gate B capture config, `.github/` workflows, `package.json` / lock, deploy config, NYC reference PNGs.
