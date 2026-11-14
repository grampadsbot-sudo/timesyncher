# TSV #982 — Cars brand checkboxes (composer-2.5 lane)

**Starting HEAD:** `a1dea86f131c39a0571cbfcb05783d159cf7376d` (`git rev-parse HEAD` before edit)

## Change

| Path | Why |
| --- | --- |
| `public/ts-car-brand-filter.js` | One reversible checkbox per rental brand (logo + name), 44px touch chips, hide per-vehicle Remove buttons without deleting Things; short Priceline Express Deal label |
| `scripts/test_acceptance_982_car_brand_checkboxes.mjs` | NYC snapshot fixture: brand toggles, no Remove, Hertz/Thrifty hide+restore @ 390 and 430 |

Host must add `scripts/test_acceptance_982_car_brand_checkboxes.mjs` to `scripts/offline-tests.txt` before push (lane brief bans editing that manifest).

## Verification (uncommitted; host commit/push)

| Command | Result |
| --- | --- |
| `node scripts/test_car_brand_filter_scope.mjs` | pass |
| `node scripts/test_acceptance_982_car_brand_checkboxes.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | **fail** — new test not in manifest (host adds line) |

No git stage/commit/push in lane.