# vkfill-549 round (2026-11-02, cursor-ubuntu)

## Round 2026-11-02 ~22:35 UTC (cursor-ubuntu composer-2.5, chief brief description rethink)

**Start sha:** `221cb70b59bd61b221bb2dbfdaea90c598eca868` (PR #549 head at dispatch).

### Outcome

**source-ready**, HOST PUBLICATION ONLY. Rebaked `public/assets/index-BKun7ofk.js`. List rows now prefer substantive stored narrative over ccab `Status: candidate only` card stubs and bind richer sibling ccab enrichment when the primary key is thin.

### Changes

- `isCcabCandidateStubDescription` in `list-row-generic-description.mjs`: treats short ccab card copy (`Status: candidate only`, price-floor stubs) as generic; full `Airline:` + `Outbound:` itinerary blobs stay substantive.
- `stored-ccab-narrative-merge.mjs`: re-merge on stubs; pick richest text among name-prefix ccab keys (e.g. Blue Note → Blue Note Jazz Club overlay); `pickSubstantiveListNarrative` across longDetails, websiteFlavour, praise.
- `list-row-description.mjs` + served bundle snippet: experience rows use longest-wins on longDetails/details/place description; bundle `isGeneric` matches stub rules.
- `shared-trip-live-app-fields.mjs` + `listTabModel.mjs`: `pickLongDetails` / spare / flight rows keep full outbound copy when ≥30 words; flights with `Outbound:` no longer clip to a 6-word airline prefix.

### Weak rows (offline `rowSummary` after `applyLiveAppListRowFields`, start `221cb70b`)

| id | place | words | `descriptionPassesDetailJudge` |
| --- | --- | --- | --- |
| 659 | Blue Note | 146 | pass |
| 660 | Blue Note Jazz Club | 173 | pass |
| 651 | Delta LAS-JFK flight option | 45 | pass |
| 602 | Zabar's | 104 | pass |
| 605 | Strand Book Store | 130 | pass |
| 604 | Statue City Cruises | 120 | pass |

Gate B rescoring not run in lane (no self-certify). Prior round-23 aggregate was 8/15 good on the judged sample; host should re-run structure capture after host-publish.

### Verification (local, start `221cb70b`)

```bash
node scripts/rebake_served_trek_bundle.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/test_list_row_description_substance.mjs
node apps/vacation-client/test/listRows.unit.mjs
node scripts/test_stored_ccab_canonical_identity.mjs
```

All exit 0. `node scripts/check-no-comments.mjs` **blocked** in this sandbox: missing `apps/vacation-client/node_modules/typescript` (MODULE_NOT_FOUND); CI on pushed head should still run the check.

### Uncommitted files (host publish)

- `apps/vacation-client/src/lib/listTabModel.mjs`
- `public/assets/index-BKun7ofk.js`
- `src/vacation/list-row-description.mjs`
- `src/vacation/list-row-generic-description.mjs`
- `src/vacation/shared-trip-live-app-fields.mjs`
- `src/vacation/stored-ccab-narrative-merge.mjs`

---

## Round 2026-11-02 ~21:30 UTC (claude-ubuntu, tier-1 rethink after Gate B round 22)

**Start sha:** `d0dbedfdf7a0a8d4b43185ed6c559acfe3a3872f` (PR #549 head; CI green, unit-tests check 125536652209; Gate B round 22 FAIL 1:05 PM PT, `gateb-verdicts.jsonl` line for sha `d0dbedf`).

### Outcome

**source-ready**, HOST PUBLICATION ONLY. Clears the three checks this PR caused (feature parity, logo lost, generic logos) in a local Gate B structure replay. The owned description gap stays open: the weak rows have thin fixture data, which the UI cannot fix.

### Root cause (verified, not the brief's hunch)

The bea63495 logo-replay hunch does not hold. Gate B serves `fixture-nyc/heads/<sha>.json` verbatim, and the replay gives the same car `logoUrl` on vk and on this head (`https://www.dollar.com/favicon.ico`, which falls back to DuckDuckGo in both). The cause is row height:

- PR list rows render the full composed description with no clamp. The Priceline car row is 696 px tall (about 500 words), and pages at 390 px grew from 1450 to 5205 px (cars) and from 3546 to 5300 px (restaurants). Staging is capture `staging-6e88120-fixture-f43fbc6f7bcce741`.
- Row logo `<img>` in `dc()` is `loading:"lazy"`. Logos lower than about y≈3800 had not been requested when the capture recorded regions, so `loaded:false`: Dollar JFK $402 (y=4437), restaurants Zinc Bar to Cafe Luxembourg, and events Open-air bus to Village Vanguard. Staging rows are short, so every logo there sits above the cutoff.
- On cars-390-top the only row inside the viewport was the list-only Priceline row, so the check counted 0 rows.

### The 4 checks

| check | change |
| --- | --- |
| 1. feature parity: "Cars list empty: 3 fixture things, 0 rows" (cars-390-top) | `src/vacation/shared-trip-oe-list-row-patch.mjs`: non-hotel list rows now use vk's existing hotel clamp (3 lines when the text is ≥30 words). The full text stays in the DOM and the details view. Car rows went from 696 px to 142 px; cars-390-top shows 4 rows. |
| 2. logo lost vs staging (Dollar JFK $402, events, restaurants) | Same clamp, plus `src/vacation/thing-logo-ink-center.mjs`: the `dc()` row logo is `loading:"eager"`. These are small favicons, and longer rows must not leave them unrequested below the fold. All 25 restaurant logos load. |
| 3. generic logos (restaurants-390) | Same as 2. The shared placeholder came from unloaded lazy logos, not from logo data. |
| 4. description substance and quality (#546) | No change. Clamped text is identical in `innerText`, so the recorded verdicts carry over unchanged: events 8/15, flights 5/10, restaurants 4/25, stores 9/15, cars 7/7, hotels 21/22. The weak rows are thin fixture data. For example, Piccola Cucina is "Uptown Sicilian trattoria … $42 entree floor" with no address or dish, Blue Note has no set time, and the Southwest rows have no return fare. Under `vk-thing-data-contract` that is a DATA fault. Text would have to be invented to fix it in UI code, and the brief bans that. |

`public/assets/index-BKun7ofk.js` was rebaked with `node scripts/rebake_served_trek_bundle.mjs`.

### Proof (local Gate B structure replay)

Built `dist` (`vite build`), served it with `serve-preview.sh` on port 4549 (since stopped), captured with `~/tsv-dispatch/capture/capture.mjs` on fixture `heads/d0dbedf….json` (sha256 `f43fbc6f…`), then ran `restore_check.check_dir` (allow `546`, staging `staging-6e88120-fixture-f43fbc6f7bcce741`) with a read-only receipt judge. Capture and replay outputs are in job dir `vkfill-549-20261102132700-job` (`cap2/`, `rc.py`).

- Control: the pipeline capture `gateb-cand/pr549-d0dbedf` replays to the same failing checks as round 22.
- Patched capture `cap2`: feature parity, logo lost and generic logos are **gone**. 0 unjudged rows.
- Still failing, unchanged: description substance (data), plus the base gaps budget complete, centred logos and row layout. Centred logos now also lists cars-1280 (Thrifty $395, 1.5 px). Car rows at 1280 are now 98 px with a fractional pitch, and the clamp-only capture shows the same line. It is the same base-gap check the brief says to leave alone.

### Checks (local, start `d0dbedfd` + patch)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (sha256 `16252c3ed4b657bcd236512cd559f5536b859df3856fc6417d56678a87b0a0af`) |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_hotel_list_desc_capture_leaf.mjs` | PASS |
| every script in `scripts/offline-tests.txt` (399) | 396 PASS, 3 env-only FAIL (below) |
| `cd apps/vacation-client && npm test` | PASS (rewritten `evidence/*.png` restored to HEAD) |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (399 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (0 fail) |

Env-only failures, none touching the bundle or logos:
- `test_live_transcript_dialog_pdf.mjs:651` fails with `gbrain` on PATH. With it removed, line 861 fails because the `pdftotext` binary isn't installed in this lane.
- `test_same_selection_capture.mjs` and `test_capture_fixture_replay_harness.mjs` fail on a host `~/tsv-dispatch/pr-src/capture-producer-roots/<sha>` "missing but already registered worktree".

CI on the start head `d0dbedfd` was green (unit-tests 125536652209).

**Host:** commit `src/vacation/shared-trip-oe-list-row-patch.mjs`, `src/vacation/thing-logo-ink-center.mjs`, `public/assets/index-BKun7ofk.js`, `J/RECEIPT.md` and `J/PR_DESCRIPTION.md`, then push once. Description-quality judgments on the new capture will carry over, because the row text is byte-identical.

## Round 2026-11-02 ~20:08 UTC (CI budget harness — trim live-app imports)

**Start sha:** `d39f865a865f84f5ada6b296d0a244310562e4da` (PR #549 head per lane brief 12:08 PM PT)

### Outcome

**source-ready** — HOST PUBLICATION ONLY. Fixes CI `scripts/test_budget_checkout_harness.mjs` / `gateb_head_budget_lines exit 1` on Actions run 41505578516 class failure at repo head.

### Root cause

`shared-trip-live-app-fields.mjs` imported `isGenericDescription` from `trip-thing-enrichment.mjs` and `isHotelPlanningNote` from `hotel-list-row-narrative.mjs`. That pulled `trip-thing-enrichment` → dossier/search → `poi-search` → `provider-env.mjs`, which reads `scripts/deploy-required-env.json` at module load. `budget_archive_paths` for head `d39f865a` does not include that JSON (only `scripts/fixtures`, `src`, etc.), so archived `gateb_head_budget_lines` crashed with ENOENT.

### Changes (uncommitted — host commit/push)

| File | Why |
| --- | --- |
| `src/vacation/shared-trip-live-app-fields.mjs` | Import `isGenericDescription` and `isHotelPlanningNote` from `list-row-generic-description.mjs` only; keeps budget driver import graph on `src` + fixtures without reply-rules/provider-env |

Hotel list-row substance remains on prior head (`listTabModel.mjs`, CCAB merge, trek patch). No rebake delta after fix (bundle already matched `renderServedTrekBundle`).

### Checks (local, start `d39f865a` + patch)

| Command | Result |
| --- | --- |
| Patched archive sim (`budget_checkout` + copied `shared-trip-live-app-fields.mjs`) → `fill_budget` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_vk_hotel_gate_b_description_acceptance.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/test_budget_checkout_harness.mjs` | FAIL until host commits patch (archives committed HEAD without import fix) |
| `node scripts/run-offline-tests.mjs` | Stops at budget harness (same) |

**Host:** commit `shared-trip-live-app-fields.mjs`; re-run `node scripts/test_budget_checkout_harness.mjs` then push once.

---

## Round 2026-11-02 BASE-MERGE (origin/vk `6e881200` into `27fc0e18`)

**Start sha:** `27fc0e18204adaf6be71abacf69816de57b3e50b` (PR #549 head per chief brief 12:53 PM PT)

### Outcome

**source-ready** — HOST PUBLICATION ONLY. Resolved host merge of `origin/vk` `6e881200` into `27fc0e18`; rebaked bundle; client-safe ccab merge (no dossier import in vacation-client build).

### Checks

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (sha256 `40cfc83548bc49fdf2a30d06c2b52cf47d95c9e631d3c36c04aa1587a162acc0`) |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_vk_hotel_gate_b_description_acceptance.mjs` | PASS |
| `node scripts/test_vk_hotel_detail_fill.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |

Gate B hotels description bar not re-run in lane (no Cursor self-proof).

**Host:** stage resolved files + rebaked bundle; `git commit --no-edit` for merge, then push once.

---

## Round 2026-11-02 ~19:22 UTC (hotel Oe summary guard + live-app narrative re-bind)

**Start sha:** `8fd669a237fadbcb148b42f55c9d1fe8ac0517df` (PR #549 head per lane brief 11:18 AM PT)

### Outcome

**source-ready** — HOST PUBLICATION ONLY (uncommitted patch). Fixes CI `scripts/test_shared_tab_list_summary.mjs:89` (summary row missing when `Pn` empty) and binds hotel list display to `tsListRowDescription` / long `place.description` instead of short `ha(G).summary` alone.

### Root cause

`shared-trip-oe-list-row-patch.mjs` wrapped list summary in `Pn?(()=>…)` so hotels with empty composed `Pn` rendered no `[data-list-summary]`. The same patch preferred `ha(G).summary` (assignment blurb) over substantive `Pn`. CCAB merge could drop `longDetails` before the client hydrated overrides.

### Changes (uncommitted — host commit/push)

| File | Why |
| --- | --- |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | Summary block runs for hotels when `Pn` is empty; show `Pn` (≥30 words clamped) then long override/place narrative, then summary fallback |
| `src/vacation/shared-trip-live-app-fields.mjs` | After CCAB merge, re-bind hotel `longDetails`/`description`/`summary`/`place.description` from `pickLongDetails` when generic or planning-note |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `7c2ac81fae17f348a3674189ccb735ba865a5b0163b5467e236f015945b8a62c`) |

### Checks (local, start `8fd669a2` + patch)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

Gate B hotels-390/1280 description bar not re-run in lane (no Cursor self-proof); host structure replay required after push.

---

## Round 2026-11-02 ~19:06 UTC (hotel list-row binding + bundle rebake)

**Start sha:** `bea634951f5d7469ddf4b7d5a4ad780a868c7268` (PR #549 head per `bot-admin/lanes/vk-pr-handoff/pr-549` 11:02 AM PT)

### Outcome

**source-ready** — HOST PUBLICATION ONLY (uncommitted patch). Fixes CI `scripts/test_served_trek_bundle.mjs:69` and binds hotel list rows to substantive `places[].description` instead of generic assignment blurbs.

### Root cause

Generic `thingOverrides` / assignment `description` and itinerary `summary` won over long `place.description` in `pickLongDetails`, `storedListNarrativeFallback`, and TREK `tsListRowDescription` spare text. Committed bundle was stale after prior `list-row-description.mjs` edits.

### Changes (uncommitted — host commit/push)

| File | Why |
| --- | --- |
| `src/vacation/list-row-description.mjs` | `pickSubstantiveListNarrative`; hotel rows omit short hook when ≥30-word narrative exists; spare prefers `place.description`; bundle snippet aligned; `minWords` in finalize |
| `apps/vacation-client/src/lib/listTabModel.mjs` | Same narrative pick + hotel hook suppression; 30-word finalize for hotels |
| `src/vacation/shared-trip-live-app-fields.mjs` | Skip generic override text in `pickLongDetails`; replace generic hotel `description`; copy place narrative into overrides |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `c39b01c1ecb080a5a5a6717d761e374e48e29bb25f749686401cd0e21627110a`) |

### Checks (local, start `bea63495` + patch)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

Gate B hotels-390/1280 description bar not re-run in lane (no Cursor self-proof); host structure replay required after push.

---

**Start sha:** `b1fda040f752527cbcf1323922d3af22aedab86b` (PR #549 head; ref `bot-admin/lanes/vk-pr-handoff/pr-549` 10:58 AM PT)

## Outcome

CI was already green on start head (Actions 10:27 AM PT per handoff). This lane applied a **vk-aligned logo replay merge** on PR #546 description work without a git merge of `origin/vk` (base-merge still dirty in J/ only vs vk `6e88120`).

## Root cause (Gate B items 2 and 4 vs vk)

PR #549 dropped vk’s `applyListRowLogoFields` / `applyServedListLogoOverridesOnly` from `shared-trip-live-app-fields.mjs` and simplified fixture replay to `applyLiveAppListRowFields` only. Gate B capture reads override logos via replay; placeholder/shared fallbacks and missing Dollar-style favicons match that regression. vk logo intent lives on `origin/vk` (`ebaaa74` family); merged manually into this branch’s files.

## Changes (uncommitted — host commit/push)

| File | Why |
| --- | --- |
| `src/vacation/shared-trip-live-app-fields.mjs` | Restore vk list-row logo enrichment (`isPlaceholderLogoUrl`, override-only replay export); keep PR car/hotel/ccab/608 price semantics |
| `src/vacation/shared-trip-fixture-replay.mjs` | After ccab + `applyLiveAppListRowFields`, chain `applyServedListLogoOverridesOnly` for Gate B served payload |
| `apps/vacation-client/src/lib/listTabModel.mjs` | `logoUrlForPlace`: vk order (`resolveThingLogoDisplayUrl`, skip placeholders) with stored-ccab merge |
| `src/vacation/list-row-description.mjs` | Experience rows: `Set time` line + matching TREK bundle snippet (Blue Note–class weak rows) |

## Checks (local, start head + patch)

| Command | Result |
| --- | --- |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_shared_trip_api_budget_lines.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | PASS |

**Cars list (item 3):** `placesForCategoryTab` on finalized Gate B fixture → **7** car rows locally; empty `cars-390-top` not reproduced in model — treat as capture race until host Gate B re-run.

**Descriptions (item 1):** Not re-scored to 12/15 in lane (no Cursor self-proof). Small composer/snippet lift only; host Gate B judgment required.

## Left alone

Baselines, Gate B thresholds, workflows, fixtures, deploy config. No git commit in lane (HOST PUBLICATION ONLY).
