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