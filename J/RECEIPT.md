# Lane receipt — issue #441 (row logo centring + Blue Note generic logo)

**Start HEAD:** `6c35291ca69bbb2730a39cc5bccbc5a0b7640479` (vk, HOST PUBLICATION ONLY — uncommitted PATCH for outer host)

## Root causes

1. **Generic logo on Blue Note rows:** Served TREK `_l()` returned `pDe` when `qr(G)` (family_event) ran **before** reading stored `logoUrl`, so real URLs were replaced by the generic SVG placeholder.
2. **~1px low vs name line:** `tsCenterThingLogoInk` only nudged when `TS_LOGO_INK_CY` had a table entry; unknown logos skipped ink bbox measurement.

## Changes

| Area | File | What |
| --- | --- | --- |
| List resolver | `src/vacation/trek-list-logo-qr-patch.mjs` | New: `LIST_LOGO_QR_GUARD_PATCH` + `patchListLogoQrGuard()` — prefer non-placeholder stored URL before `if(qr(G))return pDe`. |
| Patches | `src/vacation/trek-live-product-patches.mjs` | `patchThingLogoChipAlignment` calls qr guard first; re-exports from qr patch module. |
| Ink center | `src/vacation/thing-logo-ink-center.mjs` | Canvas `getImageData` + `tsInkBboxCenterYFromRgba` when table lookup misses. |
| Bundle | `src/vacation/trek-style2-bundle.mjs` | Assert served bundle embeds qr guard; import needles from qr patch. |
| Rebaked | `public/assets/index-BKun7ofk.js` | `node scripts/rebake_served_trek_bundle.mjs` (sha256 `14bd4bbb7a161d10e1ce14252d35256e7d5a2956d15a534653478e6d2c159380`). |
| Data | `scripts/fixtures/vk-search-census/results/{659,660,661}.json` | `logoUrl` for Blue Note entities (gate-b fixture already had URLs). |
| Test | `scripts/test_issue_441_row_logo_fix.mjs` | Fixture logos, patch + served bundle guard. |
| Test | `scripts/test_thing_logo_ink_center.mjs`, `scripts/test_shared_logo_chip_center_bundle.mjs` | Updated for qr guard + canvas ink path. |
| Manifest | `scripts/offline-tests.txt` | Registered `scripts/test_issue_441_row_logo_fix.mjs`. |

## Checks (local, start HEAD `6c35291`)

| Command | Result |
| --- | --- |
| `node scripts/test_issue_441_row_logo_fix.mjs` | PASS |
| `node scripts/test_thing_logo_ink_center.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (0 fail) |

Gate B pixel PASS on PR head is **not** claimed here (lean lane; host CI + Ubuntu Gate B after push).

## Host next

Commit all paths above on branch `vkfill/441-20261031180405`, push once, open PR to `vk` titled `fix(#441): …` with `Closes #441`.
