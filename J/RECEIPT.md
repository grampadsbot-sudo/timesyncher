# TSV #982 — Cars brand checkboxes (composer-2.5 lane)

**PRE-DONE fix starting HEAD:** `27730e4641e7af796f2cf13e8e66b434e5d7e6cb` (feature commit already on branch)

## Change

| Path | Why |
| --- | --- |
| `public/ts-car-brand-filter.js` | One reversible checkbox per rental brand (logo + name), 44px touch chips, hide per-vehicle Remove buttons without deleting Things; short Priceline Express Deal label |
| `scripts/test_acceptance_982_car_brand_checkboxes.mjs` | NYC snapshot fixture: brand toggles, no Remove, Hertz/Thrifty hide+restore @ 390 and 430 |
| `scripts/offline-tests.txt` | Register acceptance test (PRE-DONE manifest) |

## Verification (uncommitted; host commit/push)

| Command | Result |
| --- | --- |
| `node scripts/test_car_brand_filter_scope.mjs` | pass |
| `node scripts/test_acceptance_982_car_brand_checkboxes.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |

**Uncommitted paths for host:** `scripts/offline-tests.txt`, `J/RECEIPT.md` (and artifact PNGs under `.artifacts/nyc-screen-verify/screenshots/` if host wants them)

No git stage/commit/push in lane (host publication).