# TSV #969 / PR #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `87b042ca6eb4c01706bb08af010840c8a42c854f` (verified `git rev-parse HEAD` before edit)

**Base merge:** Host merge not in progress in this worktree (clean tree; no conflict markers). Chief dirty-head brief deferred.

## Root cause (CI `unit-tests` on tip `87b042ca`)

Commit `87b042ca` switched v3 detail Summary from the readonly card (`data-ts-detail-summary-readonly`) to `field('summary')` for #969 section-order acceptance. `scripts/test_nyc_screen_verify_chrome.mjs` still waits on `[data-ts-detail-summary-readonly]` (lines 354, 389), so Puppeteer timed out after 120s.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-thing-detail-v3-patch.mjs` | In view mode, tag Summary `section` with `data-ts-detail-summary-readonly="1"` alongside `data-ts-detail-section="summary"` and `h3` heading (both NYC verify and #969 order). |
| `public/assets/index-BKun7ofk.js` | Rebaked served bundle (`node scripts/rebake_served_trek_bundle.mjs`). |

## Local verification (starting HEAD `87b042ca`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | pass |
| `node scripts/test_nyc_screen_verify_chrome.mjs` | pass |
| `node scripts/test_ui_734_round2_punchlist.mjs` | pass |
| `node scripts/test_issue_959_owner_pencil_webkit.mjs` | pass (390/430 WebKit) |
| `cd apps/vacation-client && npm test` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/run-offline-tests.mjs` | **stopped** at `scripts/test_live_transcript_dialog_pdf.mjs:651` — `gbrain-cli-get_page` vs `bundled-get_page` (env/harness; out of #971 scope; do not edit test) |

No git stage/commit/push in lane.

## Host next steps

Stage `src/vacation/trek-thing-detail-v3-patch.mjs` and `public/assets/index-BKun7ofk.js` → commit → push `vkfill/969-20261112114227` → wait for CI (`unit-tests`, `accept`, `secrets`, `gateb`) on new tip.