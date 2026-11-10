# PR #940 — #859 chat edit + vk merge carry (#928/#558/#939 hero)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `48fd77b2ead20a1634fe5d3cd5ad0de1065d8d3b` (verified). **Lane:** cursor-ubuntu, composer-2.5.

## Host base-merge `origin/vk` @ `1fc2ef7708aeed7a318b11b9fb3fef518f1b4044` into `48fd77b2`

| Path | Resolution |
| --- | --- |
| `J/RECEIPT.md` | Merged both sides (this file). |
| `public/assets/index-BKun7ofk.js` | vk stage-3 baseline; `node scripts/rebake_served_trek_bundle.mjs` → sha256 `31e9a3798d0a68adbc154e850d1ea263f9c609ba66112af115f4330703fc8364` (6597750 bytes); no byte change on re-run @ `48fd77b2`. |
| #928 / #558 carry | vk paths unchanged: `day-by-day-flight-conflicts.mjs`, trek-live flight patches, `dayTimelineModel.mjs`, `styles.css`, related tests. |
| #939 hero (vk) | `public/ts-trip-hero-collapse.js`, `scripts/test_vacation_app_927_hero_collapse.mjs` — expanded title unclip; dropped expanded one-line height assertions per eggbot 3:04 AM PT 11/10. |

## Issue #859 — chat itinerary edit (on `48fd77b2`)

### Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote `thingOverrides` + `perDaySchedule` only; no TREK assignment move. `buildDayTimeline` lists Thing rows from `assignments[dayId]` only, so UI stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Post-generation `rewriteBlockedActionClaim` and `blockVacationAppReplyIdCitation` had no wall-clock bound; slow paths could hit the 60s Vercel limit after Haiku returned.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as “on day,” masking missing assignments.

### Fix (product)

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

Copy-shape turn 1/2 in `_905.mjs` **fail** on vk before the assignment/bounded-postgen patch (Carbone stays on Day 1 assignment-only timeline).

## Checks (workspace @ `48fd77b2` + conflict resolution tree, 2026-11-10 UTC)

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

node scripts/test_vacation_app_927_hero_collapse.mjs
# vacation app #927 hero collapse regression passed

node scripts/test_served_trek_bundle.mjs
# served trek bundle matches the patcher

node scripts/check-no-comments.mjs
# no-comment check passed (1145 files scanned) — after apps/vacation-client npm ci

node scripts/test_offline_manifest.mjs
# offline manifest ok (443 offline, 19 online)

BASE=vk node scripts/check-code-ratchet.mjs
# code ratchet check passed (252 report, 0 fail)
```

CI run id: pending host merge commit + push on `vkfill/859-20261110023051` @ `48fd77b2`.

Not run here: live two-turn proof (`~/tsv-dispatch/lanes/jobs/chat-edit-live-proof-859-next/`), Gate B, deploy.

## Uncommitted tree for host (do not auto-stage evidence PNGs)

| Path | Note |
| --- | --- |
| `J/RECEIPT.md` | This file (conflict resolved). |
| `public/ts-trip-hero-collapse.js` | #939 hero carry from vk merge. |
| `scripts/test_vacation_app_927_hero_collapse.mjs` | #939 hero tests. |
| `evidence/vacation-client-p2-5-detail/*.png`, `evidence/vacation-client-p2-6-keepsake/*.png` | Touches from `vacation-client npm test` build; **omit** from merge commit unless host intends. |

## Host publish

1. `git add J/RECEIPT.md`, vk hero paths above; omit accidental evidence PNGs unless intended.
2. Merge commit on `vkfill/859-20261110023051`; push once; `Closes #859` per `J/PR_DESCRIPTION.md`.
3. Exact-head CI + Ubuntu Gate B per PR brief.

Did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
