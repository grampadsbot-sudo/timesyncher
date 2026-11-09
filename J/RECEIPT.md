# Issue #884 — hide logo-chip fallback once brand img paints (cursor-ubuntu / PR #885)

Start HEAD: `c41ad8bd3aa208115bd3d1b55a9c6531952960f8` (PR head after host base merge).

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

## Host base merge (PR #885, 2026-11-09)

Host merged `origin/vk` at `db5f9ee883a513cdb479f706354d4eae25725159` into PR head `c41ad8bd3aa208115bd3d1b55a9c6531952960f8`.

- **Conflict:** `J/RECEIPT.md` only (resolved: this file — #884 receipt + merge note).
- **vk carried without conflict (prior merge on branch):** `src/vacation/chat-itinerary-edit-intent.mjs`, `src/vacation/chat-itinerary-edit.mjs`, `scripts/test_chat_itinerary_edit.mjs` — keep #859/vk intent module + integration tests.
- **Served bundle:** PR rebaked bundle retained (logo `#884` patches); vk upstream hash `6748012103be769972219c26b9406f943d410f6aae625b873ffb839fe96b8780` not substituted.

## Local proof (cursor round, start HEAD `c41ad8bd`)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `timeout 120 node scripts/test_chat_itinerary_edit.mjs` | PASS (after `npm ci`) |
| `node scripts/check-no-comments.mjs` | PASS (1115 files; `apps/vacation-client` npm ci required) |
| `node scripts/test_offline_manifest.mjs` | PASS (429 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Host publish

Uncommitted in worktree for host `git add` + merge commit on `vkfill/884-20261109123208`:

- `J/RECEIPT.md` — conflict resolved.
- Staged merge residue: `src/vacation/chat-itinerary-edit-intent.mjs`, `src/vacation/chat-itinerary-edit.mjs`, `scripts/test_chat_itinerary_edit.mjs` (if not already on tip).
- Evidence/png churn under `evidence/` and `.artifacts/` — host discretion; out of #884 product scope.

Host: one push → CI on `c41ad8bd` + merge commit → Gate B NYC logo evidence (`towneplace-logo-*.png`, `broken-fallback-*.png`) per chief brief.
