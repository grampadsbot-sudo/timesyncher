# PR #759 / #758 Thing logos — lane receipt (HOST PUBLICATION ONLY)

**Start HEAD:** `a376775c55a91fbcc106809fe6fb53e629bda477` (verified before edit)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-759` — page not found (fetch rc1); worked from chief brief round 2 @ 2026-10-31.

**Outcome:** `source-ready` — unit-tests RED cause fixed locally; host must commit + push once.

## Root cause

`repairExplicitLogoUrl()` rewrote **every** `/favicon.ico` to DuckDuckGo ip3 at **data** resolution. That broke:

- Fixture expectations (`venue.example/favicon.ico`, etc.)
- Gate B event logo attribution (`eventLogoMatchesWebsite` rejects `icons.duckduckgo.com` / gstatic vs official site host → `missing_logoUrl` on rows 604/611)

Per chief brief: fallback for the 13 broken hosts applies at **runtime** (`logoImgOnErrorInline` / `logoFallbackChain`), not when declaring `logoUrl`.

## Fix

| File | Change |
| --- | --- |
| `src/vacation/thing-logo-fallback-url.mjs` | Drop blanket favicon→DDG in `repairExplicitLogoUrl`; keep `EXPLICIT_LOGO_REPAIRS` + runtime chain only |
| `src/vacation/thing-logo-capture.mjs` | Stop calling `repairExplicitLogoUrl` when persisting `logoUrl` |
| `src/vacation/shared-trip-logo-audit.mjs` | Audit uses resolved URL as stored (no pre-repair) |
| `scripts/test_shared_logo_chip_center_bundle.mjs` | Assert img `onError` uses `dataset.tsLogoFallback` (758 chain), not hide-only |
| `scripts/test_shared_place_logo_and_category.mjs` | Same bundle assertion |
| `scripts/test_trip_thing_logo_metadata.mjs` | Same bundle assertion |

## Tests run (workspace @ a376775c + uncommitted patch)

| Command | Result |
| --- | --- |
| Chief 7 offline tests (logo chip, keepsake-style2, cosmetic, place logo, trip metadata, vk search contract, tsv415) | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (384 offline) |
| `node scripts/check-no-comments.mjs` | PASS (after `npm ci` in `apps/vacation-client`) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| Full `scripts/offline-tests.txt` loop | PASS (`ALL_OFFLINE_PASS`) |

**Host:** stage only source/test files below; **discard** accidental `scripts/ops/gateb/__pycache__/*.pyc` touches from local runs. Commit, push once to `vkfill/758-20261031143659`, refresh PR #759 description. CI green on pushed head is done gate.

## Uncommitted files (intended)

- `src/vacation/thing-logo-fallback-url.mjs`
- `src/vacation/thing-logo-capture.mjs`
- `src/vacation/shared-trip-logo-audit.mjs`
- `scripts/test_shared_logo_chip_center_bundle.mjs`
- `scripts/test_shared_place_logo_and_category.mjs`
- `scripts/test_trip_thing_logo_metadata.mjs`
- `J/RECEIPT.md`

**Do not commit:** `scripts/ops/gateb/__pycache__/*` (mtime-only).
