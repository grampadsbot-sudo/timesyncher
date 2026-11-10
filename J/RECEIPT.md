# PR #885 / issue #884 — logo-chip fallback hide + vk base merge (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `7441bc9688c4ef6292f8bc696b78b8f490c04be8` (verified at round launch).

**Host base merge:** `origin/vk` at `86d90ed131c3ad519ec98a42afcdc692edcfa40e` into `7441bc96` (per brief). **Conflicts resolved this round:** `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` (both sides kept). Staged vk tree: #927 splitter/hero, budget price parity, #925 chat itinerary edit. No `public/assets/*.js` merge conflict; served bundle unchanged (`test_served_trek_bundle.mjs` PASS).

---

## Root cause (#884)

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (#884 — product sources on branch)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (prior round). |
| `apps/vacation-client/src/lib/logoChipHandlers.mjs` | Hide `.tsv-logo-fallback` on successful load; show `display:grid` on final failure. |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |

## vk carry from merge (`origin/vk`)

| area | files |
| --- | --- |
| #927 — finger drag + hero | `public/vacation-app-request.js`, `public/ts-trip-hero-collapse.js` (mobile-only mount ≤844px), `vacation-app.html`, `shared-app.html`, splitter CSS, `scripts/test_vacation_app_927_*.mjs` |
| Budget price parity (#929 round) | `apps/vacation-client/src/lib/budgetModel.mjs`, `apps/vacation-client/test/budget.unit.mjs` |
| #925 chat edit | `src/vacation/chat-itinerary-edit-day.mjs` (`mergeStoredChatItineraryScheduleOverride`), `scripts/test_chat_itinerary_edit*.mjs` |

### vk carry — chat edit sequential PUT merge

| Path | Behaviour kept |
| --- | --- |
| `src/vacation/chat-itinerary-edit-day.mjs` | `mergeStoredChatItineraryScheduleOverride` deep-merges schedule onto stored override before PUT. |
| `src/vacation/chat-itinerary-edit.mjs` | `persistItineraryWrite` passes `payload.thingOverrides` into put-body builder. |

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

## Gate B / screen_probe (#884)

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

## Handoff hold (unchanged)

`hold:test-trip-fixture` — places[23] Marriott `logoUrl` replay vs live is a **data/harness fault**, not a #884 UI stacking fix.

## Local proof (@ `7441bc96` + conflict resolve)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_vacation_app_927_touch_splitter.mjs` | PASS |
| `node apps/vacation-client/test/budget.unit.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (441 offline, 19 online) |
| `env BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | PASS (1135 files) |

No CI run id on this uncommitted tree; pending host merge commit + one push to `vkfill/884-20261109123208`.

## Host publish

1. `git add` resolved `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, and staged vk merge index; `git commit --no-edit` or single publish commit on `vkfill/884-20261109123208`.
2. Push once; exact-head CI + Gate B per handoff `pr-885`.
3. Post-deploy: `node scripts/test_vacation_app_927_webkit_touch_live.mjs` when WebKit URL available.

## Not touched

Baselines, Gate B config thresholds, `package.json`, deploy config, workflows. Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).

---

# #901 / PR #908: unit-tests fix (prior round summary, still authoritative)

**Prior start HEAD:** `3e710445c8aba3bc661ac65cafb9f4b1fed9470c`.

## Failure reproduced (9913e460 / 3e710445)

`node scripts/test_gate_b_live_replay_display_facts.mjs` gave `served: place 664 price must match hosted` (`65 !== 25`), and `externalId` wrong for 664 and 669.

## Root cause

PR rewrote 664/669/672 in Gate B served fixture while hosted live replay still held old bundle rows; ccab `Big Apple Greeter.price` 0 → null triggered estimator 65.

## Data changes (on branch; in staged merge)

| file | change |
| --- | --- |
| `scripts/fixtures/nyc-screen-trip99-live-shared-api.json` | Trip 99 post-image for 664/669/672 |
| `scripts/fixtures/gate-b-nyc-shared-staging.json` | 664 place + override `price` 0 → 65 |
| `scripts/fixtures/pr336-vk-search-places.snapshot.json` | 664 `price` 0 → 65 |
| `J/trip99-change.sql`, etc. | Host Neon apply path |

---

# PR #913 / vkfill-905 port — inherited from `origin/vk` merge

`vacation-app.html` composer status needle for `scripts/test_reply_action_claim_d2_paia_save_route.mjs`; chat-itinerary edits on staged index.
