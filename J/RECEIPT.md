# Issue #884 — hide logo-chip fallback once brand img paints (cursor-ubuntu / PR #885)

Start HEAD: `6c4006fb7af764fcd763c64449847f50401e7c7f` (PR head after host base merge `origin/vk` @ `a2159bcc`).

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: **page_not_found** on fetch (not in GBrain at lane launch).

## Root cause

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist (`visibleLogoDomCheckSource` + `logoChipFallbackStackDomCheckSource`). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `2630c7b3f2d11b583de9c8339e94861b71d1c8a02a558835e2f3e6ae40c0f87a`). |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |
| `scripts/test_shared_trip_live_tab_logos.mjs` | Assert hide-until-broken contract. |
| `scripts/test_shared_logo_chip_center_bundle.mjs` | Updated ref/display assertions. |

## Gate B / screen_probe

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

## Host base merge (PR #885, 2026-11-09 ~1:34 PM PT)

Host merged `origin/vk` at `a2159bcc01711325e810660f3ee424180391e48b` into PR head `6c4006fb7af764fcd763c64449847f50401e7c7f` (`basemerge.json` in job dir).

- **Conflict:** `scripts/offline-tests.txt` — resolved: both `test_ui_884_logo_chip_fallback_hide.mjs` and `test_ui_882_viewonly_detail_status.mjs` registered (430 offline).
- **vk carry (staged):** `#882` view-only detail status patch + test; `features/README.md`, `features/collaborators.md`.
- **Served bundle:** `node scripts/rebake_served_trek_bundle.mjs` after vk merge; sha256 `af2122b3e39f5a2856a0ee790a5423af6bf44f60e4bbddbda82db25525386d84`.

## Local proof (cursor round, start HEAD `6c4006fb`)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `timeout 120 node scripts/test_chat_itinerary_edit.mjs` | PASS (after `npm ci`) |
| `node scripts/check-no-comments.mjs` | PASS (1115 files; `apps/vacation-client` npm ci required) |
| `node scripts/test_offline_manifest.mjs` | PASS (430 offline) |
| `node scripts/test_ui_882_viewonly_detail_status.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Host publish

Uncommitted for host merge commit on `vkfill/884-20261109123208` (start `6c4006fb`):

- `scripts/offline-tests.txt` — conflict resolved (884 + 882 tests).
- `public/assets/index-BKun7ofk.js` — rebaked post-vk.
- `J/RECEIPT.md` — this update.
- Staged vk: `scripts/test_ui_882_viewonly_detail_status.mjs`, `src/vacation/trek-thing-detail-patches.mjs`, `src/vacation/trek-thing-detail-viewonly-status-patch.mjs`, feature map rows.

Host: one push → CI green → Gate B NYC logo evidence (`towneplace-logo-*.png`, `broken-fallback-*.png`) per chief brief.
