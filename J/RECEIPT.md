# PR #940 — #859 chat edit + host merge `origin/vk` @ `1fc2ef77`

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `527d2ed33a538a9f429baa65324f678996130389`. **Lane:** cursor-ubuntu, composer-2.5.

## Host merge `origin/vk` @ `1fc2ef7708aeed7a318b11b9fb3fef518f1b4044` into `527d2ed3`

| Path | Resolution |
| --- | --- |
| `J/RECEIPT.md` | Merged both sides (this file). |
| `public/assets/index-BKun7ofk.js` | Took merge stage-3 (`origin/vk`), then `node scripts/rebake_served_trek_bundle.mjs` → sha256 `31e9a3798d0a68adbc154e850d1ea263f9c609ba66112af115f4330703fc8364` (6597750 bytes). |
| #928 / #558 carry | Kept vk paths: `day-by-day-flight-conflicts.mjs`, trek-live flight patches, `dayTimelineModel.mjs`, `styles.css`, `test_issue_928_daybyday_arrival_conflicts.mjs`, `test_ui_558_daybyday_time_name_baseline.mjs`, `scripts/offline-tests.txt` registration. |

## Issue #859 — chat itinerary edit (already on `527d2ed3`)

### Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote `thingOverrides` + `perDaySchedule` only; no TREK assignment move. `buildDayTimeline` lists Thing rows from `assignments[dayId]` only, so UI stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Post-generation `rewriteBlockedActionClaim` and `blockVacationAppReplyIdCitation` had no wall-clock bound; slow paths could hit the 60s Vercel limit after Haiku returned.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as “on day,” masking missing assignments.

### Fix (product, commit `527d2ed3`)

| Path | Change |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs` | Ensure assignment on target day via TREK before schedule overrides; `placeOnDay` = assignment-only; honest `applied:false` when move fails |
| `src/vacation/chat-itinerary-edit-assignment.mjs` | Assignment find/move/create on in-memory payload + plan helpers |
| `src/vacation/chat-itinerary-edit-trek-write.mjs` | Guarded TREK writes: shared overrides PUT, assignment move PUT, day assignment POST |
| `src/vacation/chat-itinerary-edit-slug-guard.mjs` | Allowlist / demo-lock guard (split for ratchet) |
| `src/vacation/chat-itinerary-edit-day.mjs` | `assignedDayNumbersForPlace`; day resolve uses assignments for set_time / add_bar_before |
| `src/vacation/bounded-await.mjs` | `boundedAwait` + `chatReplyPostgenTimeoutMs` (default 12s) |
| `src/vacation/vacation-app-chat-postgen.mjs` | Bounded rewrite + reply ship gate factories |
| `routes/vacation-app-chat-queue.mjs` | Wire bounded post-gen steps |
| `scripts/test_chat_itinerary_edit.mjs` | Assignment mocks, guard scan targets trek-write module |
| `scripts/test_chat_itinerary_edit_905.mjs` | Copy-shape two-turn Carbone Day1→Day2 @20:30 + Zinc before Carbone; 413 + huge-overrides + queue postgen wiring checks |

Copy-shape turn 1/2 in `_905.mjs` **fail** on vk before patch `527d2ed3` (Carbone stays on Day 1 assignment-only timeline).

## #558 / #928 (vk merge carry)

**#558:** `scripts/test_ui_558_daybyday_time_name_baseline.mjs` waits for timeline title fingerprint after Day chip click; measures Day 1 + Day 2.

**#928:** Day-by-day arrival conflict flags + `scripts/test_issue_928_daybyday_arrival_conflicts.mjs` (product logic from vk; not re-authored this round).

## Checks (workspace @ `527d2ed3` + uncommitted merge tree, 2026-11-10)

```text
timeout 120 node scripts/test_chat_itinerary_edit.mjs
# test_chat_itinerary_edit: ok

node scripts/test_chat_itinerary_edit_905.mjs
# chat_itinerary_edit_failed trek_edit_write_failed 413 ... (expected oversize probe)
# test_chat_itinerary_edit_905: ok

cd apps/vacation-client && timeout 900 npm test
# vacation-client tests finished

node scripts/test_issue_928_daybyday_arrival_conflicts.mjs
# issue #928 day-by-day arrival conflict checks passed

node scripts/test_ui_558_daybyday_time_name_baseline.mjs
# ui #558 day-by-day time/name baseline chrome checks passed

node scripts/test_served_trek_bundle.mjs
# served trek bundle matches the patcher

node scripts/check-no-comments.mjs
# no-comment check passed (1145 files scanned)

node scripts/test_offline_manifest.mjs
# offline manifest ok (443 offline, 19 online)

BASE=vk node scripts/check-code-ratchet.mjs
# code ratchet check passed (252 report, 0 fail)
```

CI run id: pending host merge commit + push on `vkfill/859-20261110023051` @ rebaked bundle.

Not run here: live two-turn proof (`~/tsv-dispatch/lanes/jobs/chat-edit-live-proof-859-next/`), Gate B, deploy.

## Host publish

1. Resolve `J/RECEIPT.md` (done in tree).
2. `git add` merge paths: `public/assets/index-BKun7ofk.js`, vk carry files, `J/RECEIPT.md`; **omit** accidental `.artifacts/nyc-screen-verify/*.png` and `evidence/vacation-client-p2-5-detail/*.png` unless host intends them.
3. Merge commit on `vkfill/859-20261110023051`; push once; `Closes #859` per `J/PR_DESCRIPTION.md`.
4. Exact-head CI + Ubuntu Gate B per PR brief.

**#859 product paths (already in `527d2ed3`, no re-stage needed unless amending):** `routes/vacation-app-chat-queue.mjs`, `scripts/test_chat_itinerary_edit*.mjs`, `src/vacation/bounded-await.mjs`, `src/vacation/chat-itinerary-edit*.mjs`, `src/vacation/vacation-app-chat-postgen.mjs`.

Did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
