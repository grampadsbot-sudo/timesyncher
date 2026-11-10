# Issue #884 — hide logo-chip fallback once brand img paints (cursor-ubuntu / PR #885)

**Lane start HEAD:** `fffbe35720c2c2790ca165d8c3e173715cc5239b` (verified at launch).

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: **page_not_found** on fetch (not in GBrain at lane launch).

## Root cause

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (already on branch — tip `fffbe357`)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist (`visibleLogoDomCheckSource` + `logoChipFallbackStackDomCheckSource`). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `af2122b3e39f5a2856a0ee790a5423af6bf44f60e4bbddbda82db25525386d84`). |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |
| `scripts/test_shared_trip_live_tab_logos.mjs` | Assert hide-until-broken contract. |
| `scripts/test_shared_logo_chip_center_bundle.mjs` | Updated ref/display assertions. |

## Gate B / screen_probe

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

---

## Host base merge (PR #885, 2026-11-09 ~5:53 PM PT)

Host merged `origin/vk` at `5a67b4fc90c1e579381b02dbf94396a0d72ce9b8` into PR head `fffbe35720c2c2790ca165d8c3e173715cc5239b` (`/home/ubishere9995/tsv-work/vkfill-885-20261109172043-job/basemerge.json`). **Conflict:** `J/RECEIPT.md` only (resolved in this file). Rebake after conflict round: sha256 `af2122b3e39f5a2856a0ee790a5423af6bf44f60e4bbddbda82db25525386d84` (unchanged).

### vk carry merged with #884 (street addresses + dossier overlay — `origin/vk`)

From vk merge (not #884 logo scope; keep both behaviours):

1. **`src/vacation/shared-trip-dossier-overlay.mjs`** — When a stored dossier has a supported, `addressIsSpecific` street address, it wins over neighborhood-only `thingOverrides` / fixture placeholders.
2. **`src/vacation/intake-shared-trip.mjs`** — `applyThingPresentation` no longer overwrites a specific override address with a non-specific trip-row address.
3. **Fixtures** — Street addresses for #889 addendum in `gate-b-nyc-shared-staging.json`, `pr336-vk-search-places.snapshot.json`, `nyc_ccab_place_enrichment.json`, `nyc-screen-trip99-live-shared-api.json`; flight rows use `AAA → BBB` routes where vk updated them.
4. **`scripts/test_dossier_evidence_hydrate_682.mjs`** — Overlay regression: Park Central dossier `870 7th Ave` beats `Midtown / Central Park South`.
5. **Chat / live-app vk deltas** — `chat-itinerary-edit.mjs`, `live-app-turn.mjs`, `live-app-saved-trip-record.mjs`, `thing-detail-fields.mjs`, related tests and fixtures (`chat_qa_live_probe`, vkprloop tests, etc.) staged with merge.

vk receipt detail (prior lane): `/home/ubishere9995/tsv-work/vkfill-889-20261109150135-job/vkfill-889-RECEIPT.md`.

### Prior vk carry (#870 composer mic)

1. **`public/vacation-app-request.js` — `bindVoice`:** inline composer errors, `getUserMedia` / `SpeechRecognition` hardening, recording timer on `#voiceElapsed`.
2. **`vacation-app.html`:** `#voiceElapsed` beside `#voiceButton`.
3. **`scripts/test_issue_870_composer_mic.mjs`:** offline harness (registered in `scripts/offline-tests.txt`).

---

## Local proof (this lane @ `fffbe357` + merge index)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `timeout 60 node scripts/test_issue_870_composer_mic.mjs` | PASS |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (hash unchanged) |
| `node scripts/test_offline_manifest.mjs` | PASS (433 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | BLOCKED — `ERR_MODULE_NOT_FOUND` `@neondatabase/serverless` (worktree `node_modules` incomplete) |
| `node scripts/test_dossier_evidence_hydrate_682.mjs` | BLOCKED — same `@neondatabase/serverless` |
| `node scripts/check-no-comments.mjs` | BLOCKED — missing `apps/vacation-client/node_modules/typescript` |

Host: run blocked pre-DONE checks on full checkout before push (`npm ci` if needed).

## Handoff hold (unchanged)

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: **hold:test-trip fixture** — places[23] Marriott `logoUrl` replay vs live (gstatic favicon vs marriott.com) is a **data/harness fault**, not a #884 UI stacking fix. No fixture rewrite this round (brief bans hard-coding NYC test trip).

## Host publish (uncommitted)

- **`J/RECEIPT.md`** — merge conflict resolved (this file).
- **Staged vk merge tree** (index): dossier overlay, intake, fixtures, chat/live-app sources/tests listed in `git status` at lane END; host completes merge commit (`git commit --no-edit`) and one push.
- **No new #884 product edits this round** — logo fallback hide already on tip; conflict round = vk base sync + receipt.

## Not touched

Baselines, Gate B config thresholds, `package.json`, deploy config. Did not edit `offline-tests.txt`, workflows, or capture scripts (vk merge may have; host owns merge commit).
