# PR #940 — #859 chat edit + vk merge carry (#902/#939/#905/#884)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `613fb4f09ddf34db823e9b705cbfd95bee8b6003` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-940`.

## Host base-merge: `origin/vk` @ `b1211bf9eea151ba7aec5eca2bdf39cabbc0cd6a` into `613fb4f0`

| Path | Resolution |
| --- | --- |
| `J/PR_DESCRIPTION.md` | Merged both sides: #859 summary + vk carry (#902 stamp, #939 hero, #905/#884). |
| `J/RECEIPT.md` | This file (conflict markers cleared). |
| `public/assets/index-BKun7ofk.js` | vk stage-3 baseline; `node scripts/rebake_served_trek_bundle.mjs` → sha256 `31e9a3798d0a68adbc154e850d1ea263f9c609ba66112af115f4330703fc8364` (6597750 bytes). |
| `evidence/...` (5 PNG UU) | vk (`--theirs`) to clear merge index; host may omit from merge commit unless intended. |
| #939 hero (vk) | `public/ts-trip-hero-collapse.js`, `scripts/test_vacation_app_927_hero_collapse.mjs` — expanded title unclip. |

## Issue #859 — chat itinerary edit (on `613fb4f0`)

### Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote overrides only; no TREK assignment move. Timeline stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Unbounded post-generation rewrite/ship gate could hit 60s Vercel limit.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as on-day.

### Fix (product, prior commits on branch)

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

Copy-shape turn 1/2 in `_905.mjs` **fail** on vk before the assignment/bounded-postgen patch.

## Checks (conflict-resolution tree @ `613fb4f0`, 2026-11-10 UTC)

```text
timeout 120 node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
cd apps/vacation-client && timeout 900 npm test
node scripts/test_build_stamp_customer_hidden.mjs
node scripts/test_vacation_app_927_hero_collapse.mjs
node scripts/test_served_trek_bundle.mjs
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
test_issue_928_daybyday_arrival_conflicts: ok
test_ui_558_daybyday_time_name_baseline: ok
check-no-comments: ok (1146 files)
test_offline_manifest: ok (444 offline, 19 online)
check-code-ratchet BASE=vk: ok (252 report, 0 fail)

CI run id: pending host merge commit + push on `vkfill/859-20261110023051`.

Not run here: live two-turn proof (`lanes/jobs/chat-edit-live-proof-940-20261110-0331/watch940.py`), Gate B, deploy.

## Uncommitted source for host

| Path | Note |
| --- | --- |
| `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` | Conflict resolved |
| `public/assets/index-BKun7ofk.js` | Rebaked @ conflict round |
| `evidence/vacation-client-p2-5-detail/*.png`, `p2-6-keepsake/*.png` | vk-side UU resolution + merge M files — omit unless host intends |

**Host:** `git add` merge index + paths above (omit evidence if desired), `git commit --no-edit`; push once.

## Left alone (scope)

- Baselines, Gate B capture, workflows, `package.json` / lock (vk-merge carry only).
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
