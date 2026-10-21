Closes #580

## Summary

Enforce Craig 10/21 budget rules: every Flights/Hotel/Cars budget row shows an estimated price (never “Add price”; missing required price fails PR checks). Timeline-only budget rows from #582 stay intact. Round 2 merged current `migrate/trek-source` (includes #586 served flight list-row summaries) with only `J/RECEIPT.md` conflict resolution.

## Changes (this PR)

- `apps/vacation-client/src/lib/budgetModel.mjs` — required price completeness for Flights/Hotel/Cars; timeline-assigned rows only
- `scripts/test_budget_required_price_completeness.mjs`, `scripts/test_nyc_budget_search_fill_prices.mjs`, related budget harness tests
- Merge commit `5add6a7d` — auto-merged #586 bundle/list summary files; no budget logic edits in round 2

## Test plan

- [x] `node scripts/test_budget_timeline_only_rows.mjs`
- [x] `node scripts/test_budget_required_price_completeness.mjs`
- [x] `node scripts/test_nyc_budget_search_fill_prices.mjs`
- [x] `node scripts/test_budget_checkout_harness.mjs`
- [x] `node scripts/test_capture_fixture_replay_harness.mjs`
- [x] `node scripts/test_served_trek_bundle.mjs`
- [x] `cd apps/vacation-client && npm ci && npm run typecheck && npm run lint && npm test`
- [x] `node scripts/check-no-comments.mjs`
- [x] `node scripts/test_offline_manifest.mjs`
- [x] `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`

## Left alone (scope)

- Gate B re-run on new head (dispatcher cron)
- `scripts/test_live_transcript_dialog_pdf.mjs` lane env (`gbrain` CLI vs bundled rules snapshot)
- Baselines, workflows, checker thresholds, unrelated base-only fixes
