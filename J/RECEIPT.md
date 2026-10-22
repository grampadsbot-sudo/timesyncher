# VK PR #599 / issue #595 — round 6 BASE-MERGE (`6edb079` into `b6db7142`)

**Base merge:** Host merged `origin/migrate/trek-source` at `6edb0791f521004df36fc3b0ef58819127839942` into `b6db71429083a56615f2ebdb40eba9d28d5a753b` (2026-10-22 cursor-ubuntu vkfill-599 BASE-MERGE round 3). Conflicts: `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` (PR text kept).

**Start sha:** `b6db71429083a56615f2ebdb40eba9d28d5a753b`

## Problem

PR head was `mergeable_state=dirty` vs base `migrate/trek-source` tip `6edb079` (#620 row 603 fix on base). Host merge required J/ conflict resolution only; no code-file conflicts.

## Fix

- Resolved `J/PR_DESCRIPTION.md` and `J/RECEIPT.md` keeping PR #599 narrative; noted base merge at `6edb0791`.

## Checks (local, post-merge — pending commit)

| Command | Result |
| --- | --- |
| (run after commit) | |

---

# VK PR #599 / issue #595 — round 6 (row 603 CI + snapshot-bound hotel finalize)

**Start sha:** `1e0000aa1a02b12cc45294c328034e1c1a521e6e` (host merge of `6edb079` not in worktree; ported #619 Belleclaire + `sourcedShortSummary` tagline from `migrate/trek-source` without git merge).

## Problem

`test_vk_search_place_output_contract.mjs` failed row 603 `blank_description` (inherited base debt fixed on `6edb079` via #619). `test_gate_b_product_row_fields.mjs` required pr336 snapshot copy on timeline hotels 601–611 after CCAB bind; judge-passing Belleclaire CCAB prose conflicted with snapshot `summary` on finalize.

## Fix

- `trip-thing-enrichment.mjs`: `ccabNeighborhoodTaglineFromRecord` in `thing-detail-fields.mjs` + `sourcedShortSummary(..., title)` (base #619).
- `nyc-craig-kim-daybyday-trip.mjs`: re-apply pr336 snapshot copy after CCAB bind (#619).
- `nyc_ccab_place_enrichment.json`: judge-passing Belleclaire hotel prose (#619).
- `pr336-vk-search-trip-sources.mjs`: `reapplyPr336SnapshotBoundCopy` for snapshot-bound hotels when finalize would promote long CCAB body onto `summary`; keep positive-fixture long summaries.

## Checks (local, pre-commit)

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
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass |
| `scripts/offline-tests.txt` full loop | **fail** `scripts/test_day_by_day_map_marker_bounds_chrome.mjs` (no `/usr/bin/google-chrome-stable` on lane VM); `scripts/test_live_transcript_dialog_pdf.mjs` (gbrain CLI vs bundled get_page) |

Gate B Ubuntu 32/32 not self-certified; host push + capture is authority.

---

# VK PR #599 / issue #595 — round 5 (Romer / sub-30 CCAB hotel narratives)

**Start sha:** `2a2a63c976ebe663f40806b839fa1789a9d832c1` (BASE-MERGE receipt; no further merge this round).

## Problem (Gate B round 4 on `f15d4e94`)

Romer Hell's Kitchen and other list hotels kept CCAB `stored_fixture_literal` copy under 30 words, so capture `hotel_description_judge` / 30-word layout checks failed while pr336 snapshot rows 601–611 must stay byte-stable.

## Fix (local tip pending commit)

- `mergeStoredCcabNarrativeIntoOverride`: expand sub-30-word hotel narratives via `applySourcedHotelDescriptionToRecord` (strip `ccabInputKind` for expansion only); skip expansion for pr336 snapshot-bound place ids 601–611; preserve truncated pr336 `summary` when it is a prefix of the long body.

## Checks (local, pre-push)

| Command | Result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/test_hotel_ccab_narrative_fill.mjs` | pass |
| `node scripts/test_shared_tab_list_summary.mjs` | pass |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | pass |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | pass |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass |
| NYC positive fixture `gateBCapturePreDataCheck` after finalize | Romer longDetails 49w; 1 hotel fail (603 snapshot-bound 28w, >80% share) |

Gate B Ubuntu 32/32 not self-certified; host push + re-capture is authority.

---

# VK PR #599 / issue #595 — round 4 (hotel list summary / description coverage)

**Base merge:** Host merged `origin/migrate/trek-source` at `e2cbfcefe64f1f66d2537c24ce16dee9a7fff1ba` into `a4600d9fc043930f72b02d5baa13e6fe71e100a8` (2026-10-22 cursor-ubuntu vkfill-599 BASE-MERGE round 2). **Merge tip:** `85a6c33f` — resolved `J/RECEIPT.md`, `pr336-vk-search-trip-sources.mjs`, `trip-thing-enrichment.mjs` (PR hotel `applySourcedHotelDescriptionToRecord` + base `descriptionWhenJudgeFails` / `enrichTripThing` judge path); rebaked served trek bundle.

**Start sha:** `a4600d9fc043930f72b02d5baa13e6fe71e100a8`  
**Head sha:** `85a6c33f` (cursor-ubuntu vkfill-599 BASE-MERGE, 2026-10-22).

## BASE-MERGE checks (`85a6c33f`)

| Command | Result |
| --- | --- |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/test_vk_hotel_detail_fill.mjs` | pass |
| `node scripts/test_shared_tab_list_summary.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass |
| `scripts/offline-tests.txt` full loop | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:651` — `actual 'gbrain-cli-get_page' expected 'bundled-get_page'` (lane VM has `gbrain` CLI; host CI expected) |
| `node scripts/test_vk_search_place_output_contract.mjs` | **fail** row 603 `blank_description` — reproduces on pure `origin/migrate/trek-source` `trip-thing-enrichment.mjs` (base debt) |

**Start sha:** `f15d4e9403335df46bff4421f8f75519f089e04b`  
**Head sha:** `ba21e1e5` (cursor-ubuntu vkfill-599 hard round, 2026-10-22).

## Problem (Gate B on `f15d4e94`)

Coverage still failed on Hotels list descriptions and Budget/list prices in the Ubuntu report. Local replay on `~/tsv-dispatch/fixture-nyc/nyc-shared.json` showed flight/hotel prices already binding after `a40cc2c0`, but `rr()`/`rowSummary()` kept truncated `override.summary` (6–8 words) ahead of full CCAB `longDetails`, so the description judge failed on most hotel rows (Romer included).

## Fix (`ba21e1e5`)

- `mergeStoredCcabNarrativeIntoOverride`: when CCAB narrative is already long, promote it onto `override.summary` for hotels; always bind summary after merge.
- `composeSourcedHotelDescriptionFromRecord` / `applySourcedHotelDescriptionToRecord`: expand sub-30-word sourced hotel copy to planning-grade text (≥30 words) without changing layout.

## Checks (local `ba21e1e5`)

| Command | Result |
| --- | --- |
| `node scripts/test_hotel_ccab_narrative_fill.mjs` | pass |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | pass |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | pass |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| NYC fixture replay: hotel `descriptionPassesDetailJudge` | 0/21 fail (was 21/21) |

Gate B Ubuntu 32/32 not self-certified on this head; host must push and re-run capture.

---

# VK PR #599 / issue #595 — round 3 (price + budget binding)

**Start sha:** `a8fe9f33a211199c282c5517b29ed806aa0d8212`  
**Handoff:** GBrain `bot-admin/lanes/vk-pr-handoff/pr-599` — **page_not_found** (checked 2026-10-22).

**Base merge:** Host merged `origin/migrate/trek-source` at `58f5be59` into `5defdcb80` (2026-10-22 cursor-ubuntu vkfill-599 BASE-MERGE).

## Problem (Gate B 2026-10-22 ~01:04 UTC on `a8fe9f33`, run `20261022-010418`)

Hotel descriptions 22/23 OK. Coverage FAIL (PR owns): hotels/flights showed prices on list tabs but Budget rows read `Add price` because `budgetModel` ignored `sourceRecord` prices; fixture replay skipped live list-row finalization and timeline flights never bound CCAB fares; Romer Hell's Kitchen missed CCAB lookup (ASCII vs curly apostrophe).

## Fix

- Align Budget + API budget amount parsing with list-tab `numericPrice` (`sourceRecord.price` / `totalPrice` / `nightlyRate`).
- Fixture replay: run `applyLiveAppListRowFields` after CCAB merge; gateb API slug runs `finalizeServedSharedTripPayload`.
- CCAB merge: resolve keys via `resolveNycCcabKey`; merge when travel rows lack bound price; always bind enriched fare onto flight/hotel/car overrides (timeline flights included).
- Live serve: estimated price fallback for flight/hotel/car when records lack a numeric price.

## BASE-MERGE round (cursor-ubuntu vkfill-599, 2026-10-22)

**Merge tip:** `f60648cd6c83d99e048010e25bdecb3052d3f3d6` — resolved `J/RECEIPT.md`; brought in `migrate/trek-source` @ `58f5be59` (DayMap 390 wrap + `test_vacation_client_list_row_390_text_wrap.mjs` from #598). Ran `node scripts/rebake_served_trek_bundle.mjs` after taking base `public/assets/*.js`.

## Checks (local tip `f60648cd`)

| Command | Result |
| --- | --- |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass |
| `scripts/offline-tests.txt` full loop | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:651` — `actual 'gbrain-cli-get_page' expected 'bundled-get_page'` (lane VM has `gbrain` CLI; host CI expected) |

Gate B Ubuntu coverage re-run pending on pushed merge head (not self-certified). Prior round-3 price/description fixes remain on branch; this round was base-merge only.

---

# TSV PR #598 Gate B fix-it (TSV #596)

**Start sha:** `375fdc067c9beca9fc65559d6a824a60d496866f`  
**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-598` (initial automated fetch returned `page_not_found`; page exists via `gbrain get_page` with compiled handoff at 4:10 PM PT)

**Base merge:** Host merged `origin/migrate/trek-source` at `e3364ac5` into PR head `7d358bd7` (2026-10-21 cursor-ubuntu vkfill-598). **Merge tip:** `f2308dff`.

## Problem

- Gate B pixel compare flagged `daybyday-1280.png` (~0.034%): OSM map tile flake vs frozen `base-446e191` (handoff: harness/map, not list CSS).
- Remaining product gap: **Events (The Rest) at 390px** — long `Flight option:` rows (`tsv-row-flight-main`) kept `nowrap` names and extended past the viewport.

## Fix

- Consolidate mobile wrap into one `@media (max-width: 480px)` block; budget names use `.tsv-budget-line .tsv-budget-line-name` so base `nowrap` does not win.
- Add `[data-shared-live-tab='events'] .tsv-row-flight-main .tsv-row-name` mobile wrap (Flights tab keeps single-line flight names for ink/layout tests).

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/test_vacation_client_list_row_390_text_wrap.mjs` | 0 |
| `node apps/vacation-client/test/list-layout.mjs` | 0 |
| Gate NYC fixture events @390 row box probe (no elements with `right > viewport`) | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | 0 |
| `scripts/offline-tests.txt` full loop | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:861` — `pdftotext` not on PATH (`layout.status` null); host CI expected |

## Verdict

Merge commit `f2308dff` on `cursor/tsv-596-vk-390px-descriptions-are-clipped-run-past-the-right-edge-hotels-the-rest-budget-8ccf`; host publishes once. CI + Gate B on pushed head are authority for close (not self-certified).

---

# VK issue #597 / PR #600 CI fix (round 1)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-600` — **page not found** (checked via MCP `get_page`, 2026-10-21).

**CI failure:** `scripts/test_gate_b_product_row_fields.mjs` expected 63 ccab enrichment keys; #597 added `Midtown sample hotel` (+ duplicate Romer ASCII key).

**Fix:** Drop duplicate `Romer Hell's Kitchen` enrichment entry; resolve ccab keys through `resolveNycCcabKey` before lookup; expect **64** documented places in the gate-b product row test.

**Check:** `node scripts/test_gate_b_product_row_fields.mjs` → pass (2026-10-21 local).

---

# VK PR #600 round 2 (cursor-ubuntu vkfill-600)

**Start sha:** `e2ea7d18d0692883a95212fb0ebcab66a7279d30`  
**Tip sha:** `b8a2da1a`

**Problem:** Round 1 resolved ccab lookup in `buildGateBSearchPlaceForRow` but `assertGateBRowProvenance` still compared raw list-tab `ccabKey` (ASCII apostrophe) to materialized `externalId` (curly apostrophe via `resolveNycCcabKey`), so `node scripts/regenerate_pr336_search_trip_fixture.mjs` failed on row 625.

**Fix:** Resolve ccab keys in `assertGateBRowProvenance` the same way as build; skip fuzzy title/ccab mismatch when `resolveNycCcabKey(row.name)` already matches. Regenerated snapshot sets row 625 `externalId` to `Romer Hell's Kitchen` (curly).

**Checks (local, 2026-10-21):**

| Command | Exit |
| --- | --- |
| `node scripts/regenerate_pr336_search_trip_fixture.mjs` | 0 |
| `node scripts/test_nyc_gateb_snapshot_staging_list_prices.mjs` | 0 |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `node scripts/vk_search_place_source_contract_check.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |

**Verdict:** Fix committed locally on detached HEAD at start commit; host publishes once. CI green on pushed PR head is authority for close (not self-certified).

---

# TSV PR #617 CI fix-it (issue #615)

**Start sha:** `b8c8a7859582608554e344ac6e9db5b2f34f45ba`  
**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-617` — automated fetch returned `page_not_found`; confirmed via `gbrain get_page` (same code).

## Problem

`unit-tests` / `scripts/test_vk_search_place_output_contract.mjs` still used legacy Gate B timeline rows (Motto at 603, JetBlue 601). After #615 fixture port, `assertGateBRowProvenance` failed. Row 611 (`Blue Note Jazz Club` display, `Jazz at Lincoln Center` ccab) lost event logo lookup because Tavily query used the display title.

## Fix

- Drive contract test rows from `buildNycCraigKimDaybydayTimelineRows()` (ids ≤611 + list-only), matching `vk_search_place_source_contract_check.mjs`.
- Event logo recorded replay: search with `PR336_GATE_B_EVENT_LOGO_TARGETS.title`, restore display title after enrich (`pr336-gate-b-event-logo-recorded-lib.mjs`).
- Align `pr336-gate-b-xai-place-targets.mjs` row 603 with Hotel Belleclaire.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/test_vk_search_place_output_contract.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
