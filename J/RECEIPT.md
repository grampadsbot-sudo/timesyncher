# Issue #884 — hide logo-chip fallback once brand img paints (cursor-ubuntu / PR #885)

**Lane start HEAD:** `b465f756ad3a21f9ed84cd5fb8f4501d6c28b4d6` (verified at launch; host merge in progress).

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: **page_not_found** on fetch (not in GBrain at lane launch).

## Root cause

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (already on branch — product sources)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist (`visibleLogoDomCheckSource` + `logoChipFallbackStackDomCheckSource`). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` after host base-merge conflict (vk bundle + patcher). |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |
| `scripts/test_shared_trip_live_tab_logos.mjs` | Assert hide-until-broken contract. |
| `scripts/test_shared_logo_chip_center_bundle.mjs` | Updated ref/display assertions. |

## Gate B / screen_probe

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

---

## Host base merge (PR #885, conflict round @ `b465f756`)

Host merged `origin/vk` at `aae7739a4078c69082878fafe0f11519421194c2` into PR head `b465f756ad3a21f9ed84cd5fb8f4501d6c28b4d6`. **Conflicts:** `J/RECEIPT.md`, `public/assets/index-BKun7ofk.js` — resolved in-tree (HOST PUBLICATION ONLY; host runs `git add` + `git commit --no-edit`).

### vk carry merged with #884 (keep both behaviours)

From vk merge (not #884 logo scope):

1. **`src/vacation/shared-trip-dossier-overlay.mjs`** — When a stored dossier has a supported, `addressIsSpecific` street address, it wins over neighborhood-only `thingOverrides` / fixture placeholders.
2. **`src/vacation/intake-shared-trip.mjs`** — `applyThingPresentation` no longer overwrites a specific override address with a non-specific trip-row address.
3. **Fixtures** — Street addresses for #889 addendum in `gate-b-nyc-shared-staging.json`, `pr336-vk-search-places.snapshot.json`, `nyc_ccab_place_enrichment.json`, `nyc-screen-trip99-live-shared-api.json`; flight rows use `AAA → BBB` routes where vk updated them.
4. **`scripts/test_dossier_evidence_hydrate_682.mjs`** — Overlay regression: Park Central dossier `870 7th Ave` beats `Midtown / Central Park South`.
5. **Chat / live-app vk deltas** — `chat-itinerary-edit.mjs`, `live-app-turn.mjs`, `live-app-saved-trip-record.mjs`, `thing-detail-fields.mjs`, related tests and fixtures (`chat_qa_live_probe`, vkprloop tests, etc.) staged with merge.
6. **`scripts/test_shared_trip_spa_console.mjs`** — Extend `publicFiles` map / MIME so puppeteer harness serves vk rebrand static assets (`/brand/*`, `/ts-vk-rebrand-chrome.js`, `/favicon.ico`); no assertion change.
7. **#890 rebrand replay** — `trek-vk-890-rebrand-patch.mjs`, Vacay Keepsake surfaces, brand assets (staged with vk merge).

vk receipt detail (prior lanes): `/home/ubishere9995/tsv-work/vkfill-889-20261109150135-job/vkfill-889-RECEIPT.md`, `/home/ubishere9995/tsv-work/vkfill-890-20261109180801-job/vkfill-890-RECEIPT.md`.

### Prior vk carry (#870 composer mic)

1. **`public/vacation-app-request.js` — `bindVoice`:** inline composer errors, `getUserMedia` / `SpeechRecognition` hardening, recording timer on `#voiceElapsed`.
2. **`vacation-app.html`:** `#voiceElapsed` beside `#voiceButton`.
3. **`scripts/test_issue_870_composer_mic.mjs`:** offline harness (registered in `scripts/offline-tests.txt`).

---

## Local proof (this lane @ `b465f756` + conflict resolve)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `9183847c5fa72e9d7696dfdbb3b6f3b3128bfe37d97f097bd1457fe81a1f27aa` bytes=6597401 |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `timeout 90 node scripts/test_shared_trip_spa_console.mjs` | PASS |
| `timeout 60 node scripts/test_issue_870_composer_mic.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (435 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) @ `b465f756` worktree |
| `node scripts/check-no-comments.mjs` | BLOCKED — `apps/vacation-client/node_modules/typescript` missing; host pre-DONE |

Gate B / host capture / Keepsake QA live+PDF — not run (Cursor must not self-certify; host publish + pipeline).

## Handoff hold (unchanged)

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: **hold:test-trip fixture** — places[23] Marriott `logoUrl` replay vs live (gstatic favicon vs marriott.com) is a **data/harness fault**, not a #884 UI stacking fix. No fixture rewrite this round (brief bans hard-coding NYC test trip).

## Host publish (uncommitted)

- **`J/RECEIPT.md`** — merge conflict resolved (this file).
- **`public/assets/index-BKun7ofk.js`** — vk version + rebake (conflict resolved).
- **Staged vk merge tree** (index): dossier overlay, intake, fixtures, chat/live-app sources/tests per `git status` at lane END; host completes merge commit and one push.
- **No new #884 product edits this round** — logo fallback hide already in patcher sources; conflict round = vk base sync + receipt.

## Not touched

Baselines, Gate B config thresholds, `package.json`, deploy config. Did not edit workflows or capture scripts (vk merge may have; host owns merge commit).
