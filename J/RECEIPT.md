# #901 / PR #908: unit-tests fix on 3e710445 (round vkfill-901-20261109183250)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `3e710445c8aba3bc661ac65cafb9f4b1fed9470c` (verified). **Lane:** claude-ubuntu, claude-opus-5-5.

## Failure reproduced

`node scripts/test_gate_b_live_replay_display_facts.mjs` on 3e710445 gave `served: place 664 price must match hosted` (`65 !== 25`), the same as CI. After the price, the same test also compares `externalId`, which was wrong for 664 and 669 (served undefined; hosted had the old bundle titles).

## Root cause

- The PR rewrote 664/669/672 in the Gate B served fixture, but the hosted live replay `scripts/fixtures/nyc-screen-trip99-live-shared-api.json` still held the old bundle rows. Live staging (`/api/version` sha `d9b60879`, read this round) still serves the bundles, so `J/trip99-change.sql` has not been applied yet.
- The 9913e460 fix set ccab `Big Apple Greeter.price` 0 → null. With a null price, `buildGateBSearchPlaceForRow` → `enrichSearchPlace` takes the activity category default: `src/vacation/search-place-price-estimate.mjs:62` returns 65. Meanwhile the staging fixture, the VK search snapshot and the SQL still said `0`, which is a banned `$0` value.
- The served `externalId` is undefined for 664/669 because their new narratives are over 30 words, so `mergeStoredCcabNarrativeIntoOverride` (`src/vacation/stored-ccab-narrative-merge.mjs`) returns before it binds the ccab key.
- The live `thingOverrides` for 664/669/672 hold the bundle `title`, `address`, `externalId`, `ccabKey` and `price`. A places-only SQL would not change what `/api/shared` shows.

## Changes (data only, no source code)

| file | change |
| --- | --- |
| `scripts/fixtures/nyc-screen-trip99-live-shared-api.json` | Trip 99 post-image for 664/669/672: places/override name/title, street address, lat/lng, website/url, price (664 = 65); reservation titles 1464/1469/1472; stale bundle `externalId`/`ccabKey` removed; 669 `missingFields` no longer lists `address`. Follows the #889 pattern in 68a2369e (hosted replay edited to the planned live state). Narrative overrides were not touched. |
| `scripts/fixtures/gate-b-nyc-shared-staging.json` | 664 place + override `price` 0 → 65 |
| `scripts/fixtures/pr336-vk-search-places.snapshot.json` | 664 `price` / `sourceRecord.price` 0 → 65 (now matches what `buildGateBSearchPlaceForRow` regenerates) |
| `J/trip99-change.sql` | 664 `price = 65` (was banned `0`); added `reservations` title updates (trip_id 99, ids 1464/1469/1472) |
| `J/trip99-change.json` (new) | The `thingOverrides["place:<id>"]` set/delete keys that match the post-image. The overrides storage table was **not found** in this repo; the host applies these through its trip-99 override path. |
| `J/trip99-backup.sql`, `J/REVERT.md` | Backup for reservations; pre-image capture and revert of overrides |

### Price for 664 (brief: "keep price unless the real venue's data says otherwise")

The dossier (`scripts/fixtures/vk-search-census/results/664.json` `priceHint`) says "Free (tips not accepted)". That value can't be stored:
- `$0` is banned (skill `vk-thing-data-contract`, banned values).
- `scripts/test_gate_b_product_row_fields.mjs:270` rejects non-positive ccab prices.
- The positive Gate B contract `scripts/lib/gate-b-nyc-fixture-contract.mjs:103` fails any Thing without a price.

I tried a `missingFields: ["price"]` approach and that contract rejected it, so I reverted it. The ccab price stays null, per the managing-dr handoff fix ("price null when none"), and every copy now carries the standard estimator value of 65. **Needs a managing-dr ruling** on how a free Thing should display.

## Checks (this lane, final tree)

| check | result |
| --- | --- |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| full `scripts/offline-tests.txt` loop, 434 tests run in parallel | 431 pass. `test_check_code_ratchet` and `test_purchase_email_app_link` pass when rerun serially (with a chromium `google-chrome` shim). `test_live_transcript_dialog_pdf` fails on `spawnSync('pdftotext')` status null: `pdftotext` is not installed here (env-only) |
| `node scripts/check-no-comments.mjs` | PASS (1123 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (434 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/vk_contract_check_local.mjs`, HEAD fixtures vs this tree | Fails on both (pre-existing rows). This tree removes `664 banned_price_zero`, `664 price mismatch` and `price/event 1 failing (664)`, and adds none |

No CI run id or Gate B run id exists for this patch yet; both are pending the host push.

## Host publish

1. Commit the 8 paths above to `vkfill/901-20261109183250` on top of 3e710445; push once; update the PR body from `J/PR_DESCRIPTION.md`.
2. CI `unit-tests`, then Gate B structure on the new head. The staging fixture 664 price changes $0 → $65, so the visible budget/row price changes.
3. Before deploy: back up per `J/REVERT.md`, apply `J/trip99-change.sql` + `J/trip99-change.json` (trip_id 99 only), re-run fill for 664/669/672, then re-pull the hosted replay and staging fixture.

## Left alone (scope)

- Live override narratives for 664/669/672 (summary, itineraryNote, description, longDetails, details, review1–4) still describe the bundles. They come from the host dossier re-fill and are not predicted here.
- Other candidate-bundle rows (662/665/667 live titles still read "candidates"; the hosted replay already carries #889's renames), #887, #889, #903.
- Test-run byproducts (`.artifacts/`, `evidence/*.png`, `scripts/ops/gateb/__pycache__/*.pyc`) were restored to HEAD.
