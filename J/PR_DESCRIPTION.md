Closes #607

## Summary

- Merged `migrate/trek-source` at `e2cbfcefe64f1f66d2537c24ce16dee9a7fff1ba` into PR head `62dac9c3` (host merge): resolved `trip-thing-enrichment.mjs` (judge/ccab hotel blanking + PR list-copy helpers) and rebaked `public/assets/index-BKun7ofk.js` from base bundle.
- After merge, restored PR #607 list behavior: `listTabModel` reads `summary` before `longDetails` for list rows while `detailModel` still prefers long judge prose for detail.
- NYC Gate B fixture trip: for rows `601`–`611`, overlay `pr336-vk-search-places.snapshot.json` copy fields after ccab search fill so binding summaries match the snapshot contract.

## Checks (local)

- `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` — 0
- `node scripts/test_gate_b_product_row_fields.mjs` — 0
- `node scripts/test_vk_hotel_detail_fill.mjs` — 0
- `node scripts/test_served_trek_bundle.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — 0
- Full `scripts/offline-tests.txt` via `node scripts/run-offline-tests.mjs` with `PATH` without `gbrain` and `CHROME_PATH=/usr/bin/chromium-browser`: fails `scripts/test_live_transcript_dialog_pdf.mjs` line 861 (`null !== 0`); lane env / reply-rules load path, not changed in this round.

## Left alone (scope)

- GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-610` — page not found (noted in `J/RECEIPT.md`).
- Baselines, Gate B capture config, `scripts/offline-tests.txt`, workflows, `package.json`, deploy config.
- CI + Gate B on pushed head are authority for done (not self-certified).
