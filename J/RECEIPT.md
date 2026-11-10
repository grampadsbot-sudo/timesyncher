# PR #940 — #859 chat edit + vk base merge (#944 carry)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `79a08be34de5230889da2a4ce4d8d04c6454827e` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-940`.

## Host base-merge: `origin/vk` @ `8646e9e256a220dcd63e4e9142a11676bbd5cb15` into `79a08be3`

| Path | Resolution |
| --- | --- |
| `J/RECEIPT.md` | This file (conflict markers cleared; #859 + #944 sections merged). |
| `public/assets/index-BKun7ofk.js` | `origin/vk` then `node scripts/rebake_served_trek_bundle.mjs`. |
| `scripts/test_chat_itinerary_edit.mjs` | PR #859 assignment-move + vk queue assertions; 413 cases in `_905.mjs`. |
| `scripts/offline-tests.txt` | vk carry including `test_issue_944_daybyday_banner_tz_390.mjs`. |
| `src/vacation/trek-shared-layout-patches.mjs` | vk #944: `minmax(52px,max-content)` time column. |
| `scripts/test_issue_944_daybyday_banner_tz_390.mjs` | vk #944 new offline test. |
| `evidence/vacation-client-p2-5-detail/detail-enriched-bar-1280.png` | merge tree (vk stage). |

## Issue #859 — chat itinerary edit

### Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote overrides only; no TREK assignment move. Timeline stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Unbounded post-generation rewrite/ship gate could hit 60s Vercel limit.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as on-day.

### Fix (product, already on PR head)

| Path | Change |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs` | Assignment ensure before schedule; assignment-only `placeOnDay` |
| `src/vacation/chat-itinerary-edit-assignment.mjs` | Assignment find/move/create helpers |
| `src/vacation/chat-itinerary-edit-trek-write.mjs` | Guarded TREK writes |
| `src/vacation/chat-itinerary-edit-slug-guard.mjs` | Allowlist guard |
| `src/vacation/chat-itinerary-edit-day.mjs` | Assignment-based day resolve |
| `src/vacation/bounded-await.mjs` | 12s `boundedAwait` |
| `src/vacation/vacation-app-chat-postgen.mjs` | Bounded rewrite + ship gate |
| `routes/vacation-app-chat-queue.mjs` | Wire bounded post-gen |
| `scripts/test_chat_itinerary_edit.mjs`, `_905.mjs` | Copy-shape two-turn + timeout wiring |

Copy-shape turn 1/2 in `_905.mjs` **fail** on vk tip before the assignment/bounded-postgen patch.

## Vk merge carry — #944 PT/ET one-line at 390 (#558 safe)

Live vk already unwraps Day-by-Day conflict banners at 390. Residual: `12:37 pm PT` soft-wrapped because the served timeline grid capped the time column at `minmax(52px,64px)`.

- Keep #896 conflict-label wrap (`CONFLICT_LABEL_PATCH_WRAP` in trek patch files). Do not revert.
- Change the day timeline grid to `minmax(52px,max-content)` so time+zone can size the column on flight days while Day 2 single-time rows stay narrow for #558.
- `scripts/test_issue_944_daybyday_banner_tz_390.mjs`: banners unclipped; PT/ET not on their own line box (client-rect check).

**Unchanged:** conflict calc, #891 TZ text, NYC lock / trip 99, Gate B baselines.

## Vk merge carry — #888 flight @390 + #941 mic

At 390px, flight list cards keep departure and arrival inside the card (`apps/vacation-client/src/styles.css`, `ISSUE_888_SERVED_LAYOUT_CSS`).

- `public/vacation-app-request.js`: hide `#voiceButton` when constructors missing.
- `scripts/test_issue_870_composer_mic.mjs`: mic hidden + post-tap unsupported assertions.

## Checks (conflict-resolution tree, 2026-11-10 UTC)

```text
timeout 120 node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
node scripts/test_issue_888_clipped_text.mjs
node scripts/test_issue_870_composer_mic.mjs
node scripts/rebake_served_trek_bundle.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/test_ui_558_daybyday_time_name_baseline.mjs
node scripts/test_issue_944_daybyday_banner_tz_390.mjs
node scripts/test_itinerary_fresh_daybyday_bundle.mjs
node scripts/test_issue_887_daybyday_time_column.mjs
node scripts/test_issue_928_daybyday_arrival_conflicts.mjs
cd apps/vacation-client && timeout 900 npm test
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

| Command | Result |
| --- | --- |
| `timeout 120 node scripts/test_chat_itinerary_edit.mjs` | ok |
| `node scripts/test_chat_itinerary_edit_905.mjs` | ok |
| `node scripts/test_issue_888_clipped_text.mjs` | ok |
| `node scripts/test_issue_870_composer_mic.mjs` | ok |
| `node scripts/rebake_served_trek_bundle.mjs` | ok sha256 `7794499c32f24a71a4843357adc5c85a752435b9ef8508fad6dfaa3a16d4f87c` |
| `node scripts/test_served_trek_bundle.mjs` | ok |
| `node scripts/test_ui_558_daybyday_time_name_baseline.mjs` | ok |
| `node scripts/test_issue_944_daybyday_banner_tz_390.mjs` | ok |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | ok |
| `node scripts/test_issue_887_daybyday_time_column.mjs` | ok |
| `node scripts/test_issue_928_daybyday_arrival_conflicts.mjs` | ok |
| `cd apps/vacation-client && timeout 900 npm test` | ok |
| `node scripts/check-no-comments.mjs` | ok (1151 files) |
| `node scripts/test_offline_manifest.mjs` | ok (447 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | ok (251 report, 0 fail) |

Not run: Gate B, live two-turn proof (`lanes/jobs/chat-edit-live-proof-940-20261110-0331/watch940.py`).

## Uncommitted source for host

| Path | Note |
| --- | --- |
| `J/RECEIPT.md` | Conflict resolved (#859 + #944) |
| `public/assets/index-BKun7ofk.js` | Rebaked after vk take |
| `scripts/offline-tests.txt`, `test_issue_944_daybyday_banner_tz_390.mjs` | #944 carry |
| `src/vacation/trek-shared-layout-patches.mjs` | #944 max-content column |
| `scripts/test_itinerary_fresh_daybyday_bundle.mjs` | vk merge |
| `evidence/.../detail-enriched-bar-1280.png` | vk version |

**Host:** `git add` conflict resolutions, `git commit --no-edit` for merge; push once to `vkfill/859-20261110023051`.

## Left alone (scope)

- Baselines, Gate B capture, workflows, `package.json` / lock except `npm ci` for tests.
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
