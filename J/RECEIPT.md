# VK PR #585 lane receipt (cursor-ubuntu vkfill-585-20261021105827)

**Start sha:** `35c47439e9cbbd93b71a396d9710ab7d5b0e0d62`  
**Tip sha:** `315f09597649d856dd72ab9d6f2da3475d30d522`

## Change

Completed host-started merge of `origin/migrate/trek-source` (`abf5f38c`) onto PR branch head `35c47439`: resolved `scripts/offline-tests.txt` by keeping PR budget-price tests and base `test_budget_timeline_only_rows.mjs`. Auto-merged `budgetModel.mjs` already combines timeline-only budget rows (#582) with required Flights/Hotel/Cars price completeness (#580). Adjusted PR-owned tests so mini trips use timeline assignments and NYC budget assertions match list-only car row 609 staying off the budget tab.

## Commands (exit 0 unless noted)

- `node scripts/test_budget_timeline_only_rows.mjs`
- `node scripts/test_budget_required_price_completeness.mjs`
- `node scripts/test_nyc_budget_search_fill_prices.mjs`
- `node scripts/test_budget_checkout_harness.mjs`
- `node scripts/test_capture_fixture_replay_harness.mjs`
- `node scripts/test_check_hardcoded_content.mjs` / `node scripts/check-hardcoded-content.mjs`
- `node scripts/test_served_trek_bundle.mjs`
- `npm ci && npm run typecheck && npm run lint && npm test` (in `apps/vacation-client`, `CHROME_PATH=/usr/bin/chromium-browser`)
- `node scripts/check-no-comments.mjs`
- `node scripts/test_offline_manifest.mjs`
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs`

## Lane note

`node scripts/run-offline-tests.mjs` stops at `scripts/test_live_transcript_dialog_pdf.mjs` on this Ubuntu lane (`rules.via` is `gbrain-cli-get_page`, test expects `bundled-get_page`); not introduced by this merge. Budget and capture-replay scope tests above pass.

## Left alone (scope)

- No Gate B capture, baseline, workflow, or checker threshold edits.
- No timeline/layout/logo UI changes.
