# PR 653 vkfill-653 scope split (host publish)

Start HEAD `1e8c721104b197d5f137c563e554e4144b3d96bd` (verified). Managing-dr handoff `bot-admin/lanes/vk-pr-handoff/pr-653` 2026-10-23 3:55 AM PT.

## What changed

Reverted all Flights/Hotels/Budget UI, fixture-replay producer, and served-bundle deltas that caused Gate B pixel drift on eight flight/hotel screens (run `20261023-095425` vs base `39e5c83`). Kept only #641 dossier pipeline work:

- `src/vacation/dossier-brave.mjs` (Brave place_search vs web fallback; fail-closed on 401/403/429)
- `scripts/test_dossier_round5.mjs`
- `scripts/test_thing_evidence_dossier.mjs` (meaning-based judge regressions)

Removed diff saved for #659: `~/tsv-dispatch/patches/pr653-moved-to-659.patch` (826 lines). Deleted PR-only `src/vacation/shared-trip-fixture-replay.mjs` (capture harness still uses pinned producer `1141d5ce` via `TSV_SANCTIONED_REPLAY_PRODUCER_HEAD`).

`public/assets/index-BKun7ofk.js` rebaked; SHA256 `33ea41dbf99bb822157a4e7adf1feb0a3626d1ee7ccf9882ef2c7fe4fb390a51` matches base `39e5c83` (Gate B render parity for non-#641 surfaces).

## Uncommitted files (host commit once)

```
apps/vacation-client/src/lib/budgetModel.mjs
public/assets/index-BKun7ofk.js
scripts/fixtures/pr336-vk-search-trip-sources.mjs
scripts/ops/dispatch/build_head_fixture.py
scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs
src/vacation/shared-trip-api-budget.mjs
src/vacation/shared-trip-fixture-replay.mjs (deleted)
src/vacation/shared-trip-handler.mjs
src/vacation/shared-trip-live-app-fields.mjs
src/vacation/shared-trip-live-tab-lists.mjs
src/vacation/shared-trip-oe-list-row-patch.mjs
src/vacation/trek-live-product-patches.mjs
src/vacation/trek-thing-detail-fields-patch.mjs
J/RECEIPT.md
```

## Checks run (workspace)

| Check | Result |
| --- | --- |
| `node scripts/test_dossier_round5.mjs` | PASS |
| `node scripts/test_thing_evidence_dossier.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (291 offline) |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (hash matches base) |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/run-offline-tests.mjs` | FAIL at `scripts/test_live_transcript_dialog_pdf.mjs:651` (`rules.via` `gbrain-cli-get_page` vs expected `bundled-get_page`; env/rules load path, unrelated to this diff) |

Not claimed: CI, Gate B 32/32, run10 acceptance, merge.

## Left alone (per handoff)

Flight/hotel list prices, hotel description quality scores, Romer apostrophe / duplicate hotel rows — #659. Gate B capture, allowances, dr-judgment cron.
