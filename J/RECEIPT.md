# PR #907 — host vk merge conflict resolve @ `308ed5e4`

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `308ed5e44d95f7be292644a7d620ad107eb29e8c` (verified). **Lane:** cursor-ubuntu, composer-2.5.

## Host merge `origin/vk` @ `f8d4748f` into `308ed5e4`

Conflicts resolved: `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, `public/assets/index-BKun7ofk.js` (took vk bundle, then `node scripts/rebake_served_trek_bundle.mjs` → sha256 `acddd4e7783da2996c8eb61bfee84907fc5fb303edd88d7b664743a74792f713`).

Staged vk carry from merge index (no re-author unless noted): #884 logo sources, #927 splitter/hero/budget, #925 chat itinerary, offline tests for logo regression.

---

## Root cause (#884 — vk carry)

`dc()` logo chips stacked `.tsv-logo-fallback` with brand `img` in the same grid cell; TownePlace showed suitcase-over-Marriott after favicon load.

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | Fallback hidden on successful img load / ink center |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` / onError inline handlers |
| `apps/vacation-client/src/lib/logoChipHandlers.mjs` | Same hide-on-load contract for client chips |
| `src/vacation/shared-trip-logo-audit.mjs` | `fallback_stack` DOM check |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline regression (new; host must ensure `offline-tests.txt` already staged from merge) |

---

## #903 stored data (PR branch — unchanged this round)

- No serve-time title/narrative rewrites in `live-qa-903-presentation.mjs`.
- `GATE_B_DISPLAY_TITLE_ALIASES[609]` retained for ccab provenance.
- All 94 snapshot rows bind vs canonical builder (prior rounds).

## #927 / budget (vk carry)

| failure | fix |
| --- | --- |
| `price budget-390/1280` | `budgetLineAmount` copies `numericPrice` (`budgetModel.mjs`) |
| `daybyday-1280.png` chrome | `ts-trip-hero-collapse.js` mounts only for `max-width: 844px` |

## vk carry — chat edit sequential PUT merge

| Path | Behaviour kept |
| --- | --- |
| `src/vacation/chat-itinerary-edit-day.mjs` | `mergeStoredChatItineraryScheduleOverride` |
| `src/vacation/chat-itinerary-edit.mjs` | `persistItineraryWrite` passes `thingOverrides` |

---

## Checks @ PATCH (this lane)

| Command | Result |
| --- | --- |
| `node scripts/test_pr336_ccab_search_provenance.mjs` | PASS |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node apps/vacation-client/test/budget.unit.mjs` | PASS |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_vacation_app_927_touch_splitter.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | PASS |
| `node scripts/regenerate_pr336_search_trip_fixture.mjs` | ok, 94 places |
| `node scripts/check-no-comments.mjs` | PASS (1138 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (442 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

CI run id and Gate B verdict: pending host push.

## Host publish

1. Mark conflicts resolved: `git add J/PR_DESCRIPTION.md J/RECEIPT.md public/assets/index-BKun7ofk.js` plus staged merge paths; discard `evidence/vacation-client-p2-*/*.png` diffs from local `npm test` (not product); `git commit --no-edit` on `vkfill/903-20261109163214`; push once.
2. Exact-head CI, pregate Gate B (overall look, never height), look batch.
3. Post-deploy: `node scripts/test_vacation_app_927_webkit_touch_live.mjs` when WebKit URL available.

## Scope left alone

- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
- Baselines, Gate B thresholds, workflows, force-push from lane.
