# TSV #982 — Cars brand checkboxes + no car list stars (composer-2.5 lane)

**Fix round starting HEAD:** `d7190f371054cd54cdf3f577d66c40e9ade6e05c` (PR #993)

## Change (car brand UI — prior host commit)

| Path | Why |
| --- | --- |
| `public/ts-car-brand-filter.js` | One reversible checkbox per rental brand (logo + name), 44px touch chips, hide per-vehicle Remove buttons without deleting Things; short Priceline Express Deal label |
| `scripts/test_acceptance_982_car_brand_checkboxes.mjs` | NYC snapshot fixture: brand toggles, no Remove, Hertz/Thrifty hide+restore @ 390 and 430 |

## Change (no ratings on car cards — this lane, uncommitted)

| Path | Why |
| --- | --- |
| `src/vacation/trek-vk-982-travel-no-rating-patch.mjs` | Suppress list-row and detail-header stars for all cars (`Mi(G)`) and flights (`bn(G)`); ruling `bot-admin/decisions/vk-flights-cars-no-ratings-20261113` |
| `src/vacation/trek-star-rating-patch.mjs` | Same guard on fresh star-rating inject |
| `src/vacation/trek-style2-bundle.mjs` | Wire `patchVk982TravelNoRating` into `renderServedTrekBundle` |
| `public/assets/index-BKun7ofk.js` | Rebaked served bundle |
| `scripts/test_vk982_car_list_no_ratings.mjs` | Hertz NYC fixture has dossier score text but bundle omits car list/detail stars |
| `scripts/test_served_star_rating_bundle.mjs` | Assert travel no-rating guard in `Oe()` |
| `scripts/offline-tests.txt` | Register `test_vk982_car_list_no_ratings.mjs` |

## Verification (uncommitted; host commit/push)

| Command | Result |
| --- | --- |
| `node scripts/test_vk982_car_list_no_ratings.mjs` | pass |
| `node scripts/test_served_star_rating_bundle.mjs` | pass |
| `node scripts/test_issue_976_list_logo_stars.mjs` | pass |
| `node scripts/test_acceptance_982_car_brand_checkboxes.mjs` | pass |
| `node scripts/test_evidence_secrets.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |

**Uncommitted paths for host:** `public/assets/index-BKun7ofk.js`, `src/vacation/trek-vk-982-travel-no-rating-patch.mjs`, `src/vacation/trek-star-rating-patch.mjs`, `src/vacation/trek-style2-bundle.mjs`, `scripts/test_vk982_car_list_no_ratings.mjs`, `scripts/test_served_star_rating_bundle.mjs`, `scripts/offline-tests.txt`, `J/RECEIPT.md`

## Pre-DONE round 1 (code ratchet FILE-SIZE-500)

| Path | Why |
| --- | --- |
| `src/vacation/trek-style2-bundle.mjs` | Collapse vk982 import + `renderServedTrekBundle` return to stay at 1004 lines (was 1010) |

| Command | Result |
| --- | --- |
| `node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |

No git stage/commit/push in lane (host publication). DONE: `pass d7190f371054cd54cdf3f577d66c40e9ade6e05c` → `vkfill-982-20261114211315-job/vkfill-982-DONE`.

---

## Fix round 2 — `test_issue_964` harness (starting HEAD `24e3b11b4a7cff63e2bafc038bb0239c6317eaf6`, PR #993)

**Cause:** vk982 detail-head patch added `bn(Dt)||Mi(Dt)` guard inside the extracted rating-row IIFE; `test_issue_964_detail_overall_rating_row.mjs` and `test_issue_959_flight_row_detail_price.mjs` sandboxes did not bind `bn` / `Mi`.

| Path | Why |
| --- | --- |
| `scripts/test_issue_964_detail_overall_rating_row.mjs` | Pass `bn`/`Mi` into `new Function` params; stubs return false so rated-place row layout assertions stay valid |
| `scripts/test_issue_959_flight_row_detail_price.mjs` | Same harness fix (shared extracted snippet) |

| Command | Result |
| --- | --- |
| `node scripts/test_issue_964_detail_overall_rating_row.mjs` | pass |
| `node scripts/test_issue_959_flight_row_detail_price.mjs` | pass |
| `node scripts/test_vk982_car_list_no_ratings.mjs` | pass |
| `node scripts/test_acceptance_982_car_brand_checkboxes.mjs` | pass |
| `node scripts/test_evidence_secrets.mjs` + `node scripts/check-evidence-secrets.mjs` | pass |
| `apps/vacation-client` typecheck + lint + test (CHROME_PATH playwright) | pass |
| `node scripts/run-offline-tests.mjs` | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:651` (`via` `gbrain-cli-get_page` vs expected `bundled-get_page`) — ubuntu lane has live `gbrain` CLI; not introduced by this diff; CI checkout has no gbrain |
| `node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |

**Uncommitted paths for host:** `scripts/test_issue_964_detail_overall_rating_row.mjs`, `scripts/test_issue_959_flight_row_detail_price.mjs`, `J/RECEIPT.md` (+ vacation-client layout reruns may touch `evidence/vacation-client-*` PNGs; host should discard or commit per policy)

No git stage/commit/push in lane (host publication).