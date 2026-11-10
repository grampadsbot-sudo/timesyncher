# PR #885 / issue #884 — logo-chip fallback hide + vk base merge (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `94836a74ddd0d45a74c499c890495815138547d6` (verified at round launch).

**Host base merge:** `origin/vk` at `bb440e0f428790e9a8f3f50e42f9258aa256627d` into `94836a74` (per `vkfill-885-20261109233101-job/basemerge.json`). **Conflicts:** `J/RECEIPT.md` only (resolved this round). Staged vk tree: chat itinerary edit port (#905/#925 `mergeStoredChatItineraryScheduleOverride`). No `public/assets/*.js` merge conflict; served bundle unchanged on disk.

---

## vk carry — chat edit sequential PUT merge (from `origin/vk`)

**vk tip on merge:** `1ffd23ca895d39db3ea28eff62c7e02279881557` (vkfill-925). Host receipt: `~/tsv-work/vkfill-925-job/J-RECEIPT.md`.

| Path | Behaviour kept |
| --- | --- |
| `src/vacation/chat-itinerary-edit-day.mjs` | `mergeStoredChatItineraryScheduleOverride` deep-merges schedule onto stored override before PUT. |
| `src/vacation/chat-itinerary-edit.mjs` | `persistItineraryWrite` passes `payload.thingOverrides` into put-body builder. |
| `scripts/test_chat_itinerary_edit.mjs` | PUT stub deep `perDaySchedule` merge. |
| `scripts/test_chat_itinerary_edit_905.mjs` | Sequential move-then-bar-hop; cross-day merge; edit B PUT must not include place X. |

---

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: CI green on `94836a74`; this round completes in-progress vk merge + receipt only (no new `#884` product edits).

## Conflict resolution (@ `94836a74`)

| file | resolution |
| --- | --- |
| `J/RECEIPT.md` | Merged HEAD #885 receipt with vk #925 merge notes; removed conflict markers only. |

## Root cause (#884)

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (#884 — product sources, already on branch @ `94836a74`)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (prior round). |
| `apps/vacation-client/src/lib/logoChipHandlers.mjs` | Hide `.tsv-logo-fallback` on successful load; show `display:grid` on final failure; timeline-icon host + small `.ico` acceptance (#909 carry). |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |
| `scripts/test_shared_trip_live_tab_logos.mjs` | Assert hide-until-broken contract. |

## Gate B / screen_probe (#884)

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

## Handoff hold (unchanged)

`hold:test-trip-fixture` — places[23] Marriott `logoUrl` replay vs live is a **data/harness fault**, not a #884 UI stacking fix. No fixture rewrite this round (brief bans hard-coding NYC test trip).

## Local proof (@ `94836a74` + conflict resolve)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (439 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | PASS (1132 files; root + `apps/vacation-client` `npm ci` first) |

No CI run id on this uncommitted tree; pending host merge commit + one push to `vkfill/884-20261109123208`.

## Host publish (uncommitted)

1. **`J/RECEIPT.md`** — conflict resolved (this file); `git add` to mark resolved.
2. **`git commit --no-edit`** — conclude vk merge into `94836a74`.
3. Push once to `vkfill/884-20261109123208`; then exact-head CI + queued Gate B per handoff `pr-885`.
4. Staged vk paths: chat itinerary edit only — no extra trek `#884` edits this round.

## Not touched

Baselines, Gate B config thresholds, `package.json`, deploy config, workflows. Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
