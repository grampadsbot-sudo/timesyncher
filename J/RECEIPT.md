# Issue #884 — hide logo-chip fallback once brand img paints (cursor-ubuntu)

Start HEAD: `d25b86b355623efe24dc56a252db47a19eeb80b0` (vk when brief written).

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

## Root cause

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel 🧳) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Change

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist (`visibleLogoDomCheckSource` + `logoChipFallbackStackDomCheckSource`). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `2630c7b3f2d11b583de9c8339e94861b71d1c8a02a558835e2f3e6ae40c0f87a`). |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | New offline test for inline handlers, DOM check, bundle needles. |
| `scripts/test_shared_trip_live_tab_logos.mjs` | Assert hide-until-broken contract. |
| `scripts/test_shared_logo_chip_center_bundle.mjs` | Updated ref/display assertions. |

## Pre-DONE gatefix round 1 (2026-11-09)

| Command | Result |
| --- | --- |
| `node scripts/check-no-comments.mjs` | PASS (1114 files) |
| `node scripts/test_offline_manifest.mjs` | PASS after `scripts/test_ui_884_logo_chip_fallback_hide.mjs` listed in `scripts/offline-tests.txt` |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |

Local commit at `git rev-parse HEAD` on `vkfill/884-20261109123208` (host push + PR `Closes #884` + Gate B NYC evidence).

## Gate B / screen_probe

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

## Uncommitted files (host publish)

- `public/assets/index-BKun7ofk.js`
- `src/vacation/thing-logo-ink-center.mjs`
- `src/vacation/thing-logo-fallback-url.mjs`
- `src/vacation/shared-trip-logo-audit.mjs`
- `scripts/test_ui_884_logo_chip_fallback_hide.mjs` (new)
- `scripts/test_shared_trip_live_tab_logos.mjs`
- `scripts/test_shared_logo_chip_center_bundle.mjs`
- `J/RECEIPT.md`
