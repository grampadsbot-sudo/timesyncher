# PR #940 — #859 chat edit + vk merge carry (#887 / #902 / #939 / #905 / #884)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `5541a08ca0a248c4986f5fb92b302591c6694245` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-940`.

## Host base-merge: `origin/vk` @ `9ce029fa32d45d2bc4871f516b705e68a008eb8a` into `5541a08c`

| Path | Resolution |
| --- | --- |
| `J/PR_DESCRIPTION.md` | Merged both sides: #859 summary + vk carry. |
| `J/RECEIPT.md` | This file (conflict markers cleared). |
| `public/assets/index-BKun7ofk.js` | vk merge index + `node scripts/rebake_served_trek_bundle.mjs` → sha256 `03f7be1363454993ac33e4f6738b19b5b03fa72c64ca29f1f10c1162c94da236` (6599310 bytes). |
| Vk #887 flight timezone / day timeline (from `origin/vk`) | `trek-flight-timezone-887-patches.mjs`, `trek-day-timeline-time-887-patches.mjs`, `dayTimelineModel.mjs`, `DayTimeline.tsx`, `test_issue_887_daybyday_time_column.mjs` |
| #939 hero (vk) | `public/ts-trip-hero-collapse.js`, `scripts/test_vacation_app_927_hero_collapse.mjs` |

Dropped stray evidence / `.artifacts` PNG churn from the vk note where not in tree; local test runs may refresh `evidence/vacation-client-p2-*` — host may omit from merge commit.

## Issue #859 — chat itinerary edit (on `5541a08c`)

### Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote overrides only; no TREK assignment move. Timeline stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Unbounded post-generation rewrite/ship gate could hit 60s Vercel limit.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as on-day.

### Fix (product, commits on branch before this merge)

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

## Vk merge carry — #887 rebase onto vk (from merged `origin/vk` receipt)

Host rebase of #887 flight time zones (12:37 pm PT → 8:59 pm ET) onto live vk.

- `applyDayTimelineConflictFlags` / `resolveFlightTimelineTimes` stay in the day timeline model
- served-bundle conflict loop is the vk / #935 loop (no `patchDayTimelineConflicts887`)
- trek flight timezone + stored-time patches, display hook, layout `tsTimelineRowTime`
- invented check-in/out durations removed; hotel-wake sorts first
- DayTimeline TBD on untimed wake/sleep; #734 TBD-empty patch removed

## Checks (conflict-resolution tree @ `5541a08c`, 2026-11-10 UTC)

```text
timeout 120 node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
cd apps/vacation-client && timeout 900 npm test
node scripts/test_build_stamp_customer_hidden.mjs
node scripts/test_vacation_app_927_hero_collapse.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/test_issue_887_daybyday_time_column.mjs
node scripts/test_issue_928_daybyday_arrival_conflicts.mjs
node scripts/test_ui_558_daybyday_time_name_baseline.mjs
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

test_chat_itinerary_edit: ok
test_chat_itinerary_edit_905: ok (expected 413 oversize probe log)
vacation-client npm test: ok
test_build_stamp_customer_hidden: ok
test_vacation_app_927_hero_collapse: ok
test_served_trek_bundle: ok
test_issue_887_daybyday_time_column: ok
test_issue_928_daybyday_arrival_conflicts: ok
test_ui_558_daybyday_time_name_baseline: ok
check-no-comments: ok (1149 files)
test_offline_manifest: ok (445 offline, 19 online)
check-code-ratchet BASE=vk: ok (252 report, 0 fail)

CI run id: pending host merge commit + push on `vkfill/859-20261110023051`.

Not run here: live two-turn proof (`lanes/jobs/chat-edit-live-proof-940-20261110-0331/watch940.py`), Gate B, deploy.

## Uncommitted source for host

| Path | Note |
| --- | --- |
| `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` | Conflict resolved |
| Merge index (staged vk paths) | day timeline, trek patches, offline test reg, rebaked bundle |
| `public/assets/index-BKun7ofk.js` | Rebaked post-conflict |
| `evidence/vacation-client-p2-*/*.png` | Optional omit unless host intends |

**Host:** complete merge index (`J/RECEIPT.md`), `git commit --no-edit` for merge; push once.

## Left alone (scope)

- Baselines as approval targets, Gate B capture, workflows, `package.json` / lock (vk-merge carry only).
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
