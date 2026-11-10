# PR #885 / issue #884 — logo-chip fallback hide + vk base merge (HOST PUBLICATION ONLY)

**Lane start HEAD:** `238f15478684e3b85f424a05c47d170ec647889f` (verified at launch).

**Host base merge:** `origin/vk` at `2608a0ecbf08f33cc735b9824a357982a96d914e` into `238f15478684e3b85f424a05c47d170ec647889f`. **Conflicts:** `J/RECEIPT.md` only (served bundle already matched patcher; no `public/assets` conflict on this head).

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: **page_not_found** on fetch (not in GBrain at lane launch).

## Root cause (#884)

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (#884 — product sources, already on branch)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `9183847c5fa72e9d7696dfdbb3b6f3b3128bfe37d97f097bd1457fe81a1f27aa`). |
| `apps/vacation-client/src/lib/logoChipHandlers.mjs` | Hide `.tsv-logo-fallback` on successful load; show `display:grid` on final failure; timeline-icon host + small `.ico` acceptance (#909 carry). |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |
| `scripts/test_shared_trip_live_tab_logos.mjs` | Assert hide-until-broken contract. |

## vk carry merged with #884 (keep both behaviours)

From vk merge (not #884 logo scope):

1. **Chat / itinerary edit (#905 port)** — `chat-itinerary-edit-day.mjs`, day inference, queue turn prep, `vacation-app.html` inlined send-failure catch for static contract vs `handleChatSendFailure`, `public/vacation-app-request.js`, `routes/vacation-app-chat-queue.mjs`, tests `test_chat_itinerary_edit.mjs`, `test_chat_itinerary_edit_905.mjs`.
2. **`apps/vacation-client`** — `DayTimeline.tsx`, `dayTimelineModel.mjs` (vk timeline deltas).
3. **`src/vacation/reply-trip-context-facts.mjs`**, **`chat-itinerary-edit-intent.mjs`** — vk chat deltas.

vk receipt detail (prior lanes): `/home/ubishere9995/tsv-work/vkfill-889-20261109150135-job/vkfill-889-RECEIPT.md`, `/home/ubishere9995/tsv-work/vkfill-890-20261109180801-job/vkfill-890-RECEIPT.md`, #905 port notes in prior `origin/vk` receipt block (turn-2 hang, Zinc `.ico` — host confirms on live after deploy).

## Gate B / screen_probe

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

## Handoff hold (unchanged)

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: **hold:test-trip fixture** — places[23] Marriott `logoUrl` replay vs live (gstatic favicon vs marriott.com) is a **data/harness fault**, not a #884 UI stacking fix. No fixture rewrite this round (brief bans hard-coding NYC test trip).

## Local proof (@ `238f1547` + conflict resolve)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `9183847c…` bytes=6597401 |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (436 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | PASS (after `apps/vacation-client/npm ci`) |

## Host publish (uncommitted)

- **`J/RECEIPT.md`** — merge conflict resolved (this file).
- **Staged vk merge tree** — chat/itinerary, vacation-app, vacation-client timeline, `logoChipHandlers.mjs`; host completes merge commit and one push.
- **No new trek `#884` patcher edits this round** — logo fallback hide already in sources; conflict round = vk base sync + receipt + client handler parity.

## Not touched

Baselines, Gate B config thresholds, `package.json`, deploy config. Did not edit workflows or capture scripts.
