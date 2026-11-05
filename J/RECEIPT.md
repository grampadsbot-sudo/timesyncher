# PR #550 wrap-under-name host handoff — 2026-11-05 00:58:03 UTC

Outcome: **source-ready, uncommitted for host review** on verified starting HEAD `c40abb7222f203dd57cc9769f814dbc4c686478c`. This records a source candidate, not completed PR acceptance. Existing hard Gate B failure `20261104-220631` remains historical evidence; no new CI/Gate B result is claimed.

Authorization/scope: chief wrap-only brief and host pickup clarification; GBrain `bot-admin/receipts/gpt-816-judgment-disposition-20261104-1407`, `bot-admin/lanes/vk-pr-handoff/pr-550`, and U4 in `bot-admin/messages/time-syncher/ui-acceptance-matrix`. Closes #547 only; #796/#802 retain independent acceptance. Feature Map entry: `features/README.md` → `features/itinerary-surfaces.md` (existing shared category tabs).

## Verified regression and source change

`c40abb72` added a `Pn` description span beside the name in both `OE_LIST_ROW_SR_PATCH` and `OE_THING_HEADER_LOGO_PAIR_INLINE_DESC_PATCH`, and stripped the descriptions below the name. Gate B `20261104-220631` recorded 22/32 changed screens, including hotels-1280 height 3516→2832. This contradicts the chief's recorded Craig wrap-under-name approval.

Reversed only that commit's source changes in `src/vacation/shared-trip-oe-list-row-patch.mjs` (2 additions / 16 deletions). The existing blocks below the name remain, and the inline description spans are removed. Ran the sanctioned `node scripts/rebake_served_trek_bundle.mjs`; no compiled/minified search-and-replace. Both changed product files are byte-for-byte identical to parent `95d2314244145092c34889c60b680a675612e04b`, verified separately from the rebake test. Source SHA256 `991bc99d3c786693362f9d24d7ee6b28652e3cd16a36f1b0c62f2ade88624612`; bundle SHA256 `942d1b5e6ec3635f3bc7f0f901d56022cd1d582e78d8f57c420e8d11b13bc92c`. Manifest: `/home/ubishere9995/tsv-work/vkfill-550-20261104164939-job/source-manifest.json`.

## Local checks on this candidate (all exit 0)

| Command | Evidence under job directory |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | bundle hash above; `source-manifest.json` |
| `CHROME_PATH=/tmp/vk483-browser/chrome/linux-144.0.7559.133/chrome-linux64/chrome node scripts/test_hotel_list_desc_capture_leaf.mjs` | `hotel-list-desc-capture-leaf.log`; 390 + 1280 |
| `node scripts/test_shared_tab_list_summary.mjs` | `shared-tab-list-summary.log`; 13 flight picker cases + bundle parity |
| `node scripts/test_ui_471_apple_row_name_frame.mjs` | `ui-471-name-frame.log` |
| `node scripts/test_served_trek_bundle.mjs` | `served-bundle.log` |
| `node scripts/test_gate_b_row_name_frame.mjs` | `gate-b-row-name-frame.log` |
| `node scripts/test_car_brand_filter_scope.mjs` | `car-brand-filter-scope.log` |
| `node scripts/test_ui_734_round2_punchlist.mjs` | direct command exit 0; recorded in `verification-results.json` |
| `npm run test:keepsake-style2` | `keepsake-style2.log` |
| `node scripts/check-no-comments.mjs` | `check-no-comments.log`; 1063 files |
| `node scripts/test_offline_manifest.mjs` | `offline-manifest.log`; 401 offline / 18 online |
| `BASE=vk node scripts/check-code-ratchet.mjs` | `code-ratchet.log`; 255 report / 0 fail |
| `node --check src/vacation/shared-trip-oe-list-row-patch.mjs` / `git diff --check` | direct commands exit 0 |

Dependencies were initially absent. Existing root/client dependency directories from `vkfill-590-20261102090305` were linked for checks after verifying Neon 1.1.0, qrcode 1.5.4 and TypeScript 5.9.3 match this worktree's lockfiles. No dependency manifest or lockfile changed; the temporary dependency links were removed after checks.

## Screenshot diagnostic and acceptance limits

One set of 14 unique category/Budget screenshots at 390 and 1280 is in `/home/ubishere9995/tsv-work/vkfill-550-20261104164939-job/screenshots/`; side-by-side reference links and limitations are in `/home/ubishere9995/tsv-work/vkfill-550-20261104164939-job/SCREENSHOT_REVIEW.md`. All 94 category description rows per width are below the name and use normal whitespace (`screenshots/row-traces.json`). The job-only observer's marker assumption was corrected after an interrupted first capture; the existing first screenshot was retained. No product/test/checker/fixture change was made for capture.

`baselines/manifest.json` is absent in this supplied worktree. Saved approved-look `pr550-1809e69` images were read, but local font/logo acquisition and payload differences prevent exact pixel grading. This diagnostic is not Gate B or live/PDF acceptance. Host independently publishes, then runs ordinary CI and Gate B on the exact published head and retains required combined Craig review. No Gate B/capture service, CI rerun, counter reset, rearm, extension, merge, deploy, fill/research spend or external message was invoked by this worker.

## Governing reads / scope preserved

Loaded AGENTS.md, `.cursor/rules/style-two-keepsake-contract.mdc`, required GBrain SoTs, Keepsake QA/verification/process, strong-model handoff, Thing data contract, chief disposition and U4. `get_skill` returned skill_not_found for the three requested skill names in the accessible catalog; the strong-model and Thing contracts were read via their existing GBrain pages. `skills/agent-ready-codebase/skill` was not found; its locked source page `bot-admin/messages/time-syncher/eggbot-minsky-agent-ready-codebase-20261027` supplies the Do-first practices used here. GBrain reads succeeded despite read-only disconnect-audit warnings; no privileges or credential access were attempted.

No checker/baseline/fixture/threshold/config/dependency/data changes. No new tests or features. Existing car brand scope, Remove controls, name-frame markers, data-ts-list-desc leaf support, prices, stored text and logos remain in the parent source. No pstack, sub-agent or fallback model was launched. GBrain receipt publication is left to the host under HOST PUBLICATION ONLY.

## Hard-round report

lane=codex-ubuntu; model=gpt-6.1-sol (runner mandate, no other model invoked); effort=xhigh (dispatch brief); turns=1 worker session; cost-or-usage=not exposed in this worker's event stream; wall-time=502s from job worktree timestamp to receipt; commit-landed=no (Git read-only); ci=not run on uncommitted candidate; gateb=not run on uncommitted candidate; exception=lane-capability `bot-admin/requests/lane-dispatch-adapter-root-fix-20261017`. No automatic capability promotion.

Host-owned publication only. Product changes remain uncommitted in `src/vacation/shared-trip-oe-list-row-patch.mjs` and `public/assets/index-BKun7ofk.js`; `J/PR_DESCRIPTION.md` is prepared for the host and this receipt prefixes the earlier receipt history. Source diff is preserved at `/home/ubishere9995/tsv-work/vkfill-550-20261104164939-job/wrap-under-name-proposed.patch`.

---

# Merge vk into #550 (2026-11-02, grok-lane-3)

Kept both receipt sections below. `src/vacation/trek-style2-bundle.mjs` keeps this PR's `patchInlineListRowDescriptionOnThingHeader` and vk's budget needles (`MO_BUDGET_LEGACY_CI_NEEDLE` / `MO_BUDGET_DS_NEEDLE`). `public/assets/index-BKun7ofk.js` was rebaked with `node scripts/rebake_served_trek_bundle.mjs` (sha256 `cfffc64e2594d192e9394a1de977618ac1781733972f0ba3d3e5d516cfb5654c`). The minified auto-merge was not kept.

# vkfill-550 receipt — flight QoRest flex / row fill (HOST PUBLICATION ONLY)

## Outcome

**source-ready** on start HEAD **bc776027f59da07f24f6cf8beb530941bd7033ea** (verified before edit).

## Root cause (Gate B structure round 18, `bc776027`)

`restore_check.row_layout` on `flights-1280*.png`: Southwest rows **description does not fill the row** (e.g. 199 of 483 px). Gate B verdict `gateb-verdicts.jsonl` 2026-11-02T14:25:56-08:00, sha `bc77602`, gap_close FAIL on #547/#796.

After the QoRest split (airline-only `strong` in the logo–name pair), `QoRest` used `flex:"1 1 0"` beside the inline `data-ts-list-desc` span. QoRest grew and the description box stayed at intrinsic width (~199 px) instead of filling ≥60% of available row space (aaffa24 PASS used ~312/573 px on the same fixture row).

## Change (host publish)

| Path | Why |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | `QoRest` outer wrapper: `flex:"0 1 auto"` + `maxWidth:"55%"` (upgrade needle from old `1 1 0` / `100%`) so price/times/route shrink-wrap; inline description keeps `flex:"1 1 0"` + `minWidth:"35%"` and absorbs remaining row width. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 **257a0bcc2c5a28c2fc4218d1078ced3ff08d85ae45832754d97f41441e83645c**). |

Untouched: row layout width constants on non-flight categories, `#471` logo–name pair, `data-ts-list-desc`, car Remove controls, tests/baselines/Gate B config.

## Checks (local, exit 0)

| Command | Ref |
| --- | --- |
| `node scripts/check-no-comments.mjs` | |
| `node scripts/test_offline_manifest.mjs` | |
| `BASE=vk node scripts/check-code-ratchet.mjs` | 0 fail |
| `node scripts/test_shared_tab_list_summary.mjs` | |
| `node scripts/test_gate_b_row_name_frame.mjs` | |
| `node scripts/test_ui_471_apple_row_name_frame.mjs` | |
| `cd apps/vacation-client && npm test` | |
| `node scripts/rebake_served_trek_bundle.mjs` | |

## Uncommitted (host only)

- `src/vacation/shared-trip-oe-list-row-patch.mjs`
- `public/assets/index-BKun7ofk.js`
- `J/RECEIPT.md` (this file)

Host: commit, push once, re-run Gate B structure on new head.
# PR #801 lane receipt (vkfill-801, composer-2.5)

**Start HEAD (unchanged commit; host publish pending):** `74605610ee076ed84356400778dc3ac30b263701`

**Handoff:** GBrain `bot-admin/lanes/vk-pr-handoff/pr-801` still not found.

## Root cause

`Ci()` only attaches `Ut` reservations when `reservation_time` matches the day date. NYC Gate B fixture rows use `day_id` + `start_time` only (94/94 reservations lack `reservation_time`), so `Qa.flatMap(Ci)` never emitted those transport rows and served `Mo` omitted ~55–72 itinerary places (Amelie Bistro, Tiffany, Macy's, Bodega 88, …).

## Change

- **`src/vacation/trek-style2-bundle.mjs`:** `MO_BUDGET_NEEDLE` unions timeline `Ci` rows with `(Ut||[]).filter(wn=>wn&&wn.place_id)` catalog resolves; transport filter uses `di.item.place_id||di.place_id`; fixed `Array.from(new Map(...)).values())` paren balance.
- **`public/assets/index-BKun7ofk.js`:** rebaked; served `Mo` now includes `(Ut||[]).filter(wn=>wn&&wn.place_id)` (sha256 `1bd64613a74008e706d2028ae495a98382e58b63eef2f1e9315eaae8184b3e98`).
- **Tests:** `test_budget_timeline_only_rows` asserts NYC budget count 87 > assignment-only 15 and sample names; patch asserts updated in `test_shared_tab_filter_chips`, `test_thing_card_ui_keep`, `test_keepsake_style2`.

## Verify (local, uncommitted tree on `74605610`)

```
node scripts/rebake_served_trek_bundle.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/test_budget_itinerary_timeline_selected.mjs
node scripts/test_budget_timeline_only_rows.mjs
node scripts/test_nyc_budget_search_fill_prices.mjs
node scripts/test_check_hardcoded_content.mjs
node scripts/test_shared_tab_filter_chips.mjs
node scripts/test_keepsake_style2.mjs
node scripts/test_thing_card_ui_keep.mjs
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

All passed on this pass.

## Host

Uncommitted files: `src/vacation/trek-style2-bundle.mjs`, `public/assets/index-BKun7ofk.js`, `scripts/test_budget_timeline_only_rows.mjs`, `scripts/test_shared_tab_filter_chips.mjs`, `scripts/test_thing_card_ui_keep.mjs`, `scripts/test_keepsake_style2.mjs`. Host commit + push required; CI/Gate B not run in lane.

- Merged #549 (e344ee6) into this branch. The #549 wrapped below-row summary is kept; the inline list description is removed (summaries wrap, no ellipsis, #731). Row layout, price, car filter and Southwest fixes are kept. Bundle rebaked sha256=942d1b5e6ec3635f3bc7f0f901d56022cd1d582e78d8f57c420e8d11b13bc92c. All 25 receipt scripts pass.
- Fixed a Gate B capture failure (cars-390 click blocked): the car-brand fallback no longer counts priced buttons inside non-car rows. After #549, the summary moved below the row, so short hotel buttons matched. Test: node scripts/test_car_brand_filter_scope.mjs

## PR #821 CI fix-it — 2026-11-05

GBrain handoff page `bot-admin/lanes/vk-pr-handoff/pr-821`: **not found** (MCP `get_page` returned `page_not_found` on 2026-11-05).

CI `unit-tests` failed on `dayTimeline.unit.mjs` because day-by-day row notes now read stored `description`, not dossier claim / `itineraryNote` fallbacks. Updated `apps/vacation-client/test/dayTimeline.unit.mjs` and `listRows.unit.mjs` fixtures/assertions accordingly.

Local: `node --test test/dayTimeline.unit.mjs test/listRows.unit.mjs` pass; pre-push gates pass on branch head after commit.

CI round 3: `detail-layout.mjs` enriched flight failed `okSummary` because `detailSummary` reads stored `description` only; flight/car fixture had `summary` without `description`. Fixed in `enriched-detail-shared-trip.mjs` (verified `detailSummary` word count ≥ 30 for Delta flight).
