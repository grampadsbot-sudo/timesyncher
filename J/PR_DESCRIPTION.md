Closes #595

## What changed

**BASE-MERGE (`b6db7142` + merge commit)** — Host merged `origin/migrate/trek-source` at `6edb0791f521004df36fc3b0ef58819127839942` into `b6db71429083a56615f2ebdb40eba9d28d5a753b` (2026-10-22 cursor-ubuntu vkfill-599 BASE-MERGE round 3). Resolved conflicts in `J/PR_DESCRIPTION.md` and `J/RECEIPT.md` only (PR #599 text retained).

**BASE-MERGE (`85a6c33f`)** — Host merged `origin/migrate/trek-source` at `e2cbfcefe64f1f66d2537c24ce16dee9a7fff1ba` into `a4600d9f`. Resolved conflicts in `J/RECEIPT.md`, `scripts/fixtures/pr336-vk-search-trip-sources.mjs`, and `src/vacation/trip-thing-enrichment.mjs`: kept PR #599 hotel `applySourcedHotelDescriptionToRecord` + list-row CCAB helpers, imported base Day-by-Day fixture rows (`buildNycCraigKimDaybydayFixtureRows`), and combined base `descriptionWhenJudgeFails` / judge-aware `enrichTripThing` with PR `enrichSearchPlace` (hotel sourced copy + judge blanking for ccab semicolon sheets). Rebaked served trek bundle after taking base `public/assets/*.js`.

**Data fill (issue #595)** — Hotel descriptions from xAI grok fields + stored NYC CCAB enrichment on list rows (`xai-sourced-hotel-description.mjs`, fixture replay, live serve merge).

**Gate B fix-it (daybyday-1280 @ 0.03%, run `20261021-230524`)** — CCAB merge was copying `longDetails` / `summary` onto **timeline-selected non-hotel** overrides. Day-by-Day renders `rowSummary()` for `kind === 'thing'`, so subtitles appeared vs baseline. **Fix (7ccc8481):** bind override narrative (`longDetails`, price, logo, full `sourceRecord`) only for **hotels** and **list-only** rows; timeline non-hotels only upgrade `place.description` when thin/generic.

**CI fix-it — API budget lines (`5defdcb8`)** — Estimated F/H/C prices on `prepareSharedTripForLiveApp` updated **`scripts/test_shared_trip_api_budget_lines.mjs`** Gate B scrape fixtures (no more `$0` hotel rows).

**CI fix-it — shared tab list summary (`a4600d9f`)** — `bindHotelListSummary` was promoting the Manhattan Club CCAB card onto **PR225** `Midtown sample hotel` (title alias match), replacing the intake **“Strong transit access…”** summary. **Fix:** skip CCAB merge when the place already has a non-fixture intake `summary`; keep existing short summaries in `bindHotelListSummary`; do not rewrite `stored_fixture_literal` CCAB hotel copy in `composeSourcedHotelDescriptionFromRecord` (unblocks **`test_gate_b_product_row_fields.mjs`** snapshot binding once **`test_shared_tab_list_summary.mjs`** runs).

**Round 6 (`1e0000aa` → local tip)** — Port #619 row 603 contract fix from `migrate/trek-source` @ `6edb079` (no host merge in worktree): Belleclaire judge-passing CCAB copy, pr336 snapshot re-bind after CCAB on NYC fixture rows, `sourcedShortSummary` neighborhood tagline; snapshot-bound hotel finalize guard so pr336 `summary`/`description` stay byte-stable without breaking the positive NYC fixture.

## Verification (local, round 6)

| Command | Result |
| --- | --- |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | pass |
| `node scripts/test_vk_search_place_output_contract.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/test_hotel_ccab_narrative_fill.mjs` | pass |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |

## Notes

- GBrain handoff via agent brief (`bot-admin/lanes/vk-pr-handoff/pr-599`).
- Baselines, capture scripts, workflows, and allowlists untouched.
- Gate B Ubuntu not self-certified on this head; host push + capture is authority.
