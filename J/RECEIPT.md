# PR #940 — #859 chat edit + vk merge carry (#941 mic / lock reply)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `a850f59928f01966c98b7ac418ebc36dd5cc55f7` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-940`.

## Host base-merge: `origin/vk` @ `5a0d72e5a607fa4234bf687a956bb34e96cd10e2` into `a850f599`

| Path | Resolution |
| --- | --- |
| `J/PR_DESCRIPTION.md` | Merged both sides: #859 summary + vk carry. |
| `J/RECEIPT.md` | This file (conflict markers cleared). |
| `scripts/test_chat_itinerary_edit.mjs` | PR #859 assignment-move + trek-write guard scan; vk #941 `barHopLocked` queue assertion; 413/PUT-size cases remain in `_905.mjs` only (deduped for FILE-SIZE-500). |
| `public/vacation-app-request.js` | vk #941: hide mic at rest when SpeechRecognition missing. |
| `src/vacation/chat-itinerary-edit-day.mjs` | vk #941: `buildItineraryEditDemoLockedAuthoritativeSystemExtra()`. |
| `src/vacation/chat-itinerary-edit.mjs` | #859 assignment/bounded queue + vk #941 demo_locked authoritative reply. |

Served bundle `public/assets/index-BKun7ofk.js`: unchanged vs both parents on this merge (no rebake required).

## Issue #859 — chat itinerary edit

### Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote overrides only; no TREK assignment move. Timeline stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Unbounded post-generation rewrite/ship gate could hit 60s Vercel limit.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as on-day.

### Fix (product, on branch before this merge)

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

## Vk merge carry — #941 mic + honest NYC lock reply

- `public/vacation-app-request.js`: hide `#voiceButton` when constructors missing; unsupported copy only after tap.
- `scripts/test_issue_870_composer_mic.mjs`: mic hidden + post-tap unsupported assertions.
- Demo-locked queue turns: empty `replyContext` on skip; `prepareChatItineraryEditForQueueTurn` uses plain customer turn with authoritative lock wording (no invented itinerary facts).

## Checks (conflict-resolution tree, 2026-11-10 UTC)

```text
timeout 120 node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
node scripts/test_issue_870_composer_mic.mjs
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

timeout 120 node scripts/test_chat_itinerary_edit.mjs — ok
node scripts/test_chat_itinerary_edit_905.mjs — ok
node scripts/test_issue_870_composer_mic.mjs — ok
node scripts/check-no-comments.mjs — ok (1149 files)
node scripts/test_offline_manifest.mjs — ok (445 offline, 19 online)
BASE=vk node scripts/check-code-ratchet.mjs — ok (252 report, 0 fail)

Not run: `cd apps/vacation-client && timeout 900 npm test`, Gate B, live two-turn proof (`lanes/jobs/chat-edit-live-proof-940-20261110-0331/watch940.py`).

## Uncommitted source for host

| Path | Note |
| --- | --- |
| `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` | Conflict resolved |
| `scripts/test_chat_itinerary_edit.mjs` | Conflict resolved |
| Merge index (vk #941 paths) | `public/vacation-app-request.js`, chat-itinerary-edit*.mjs, `scripts/test_issue_870_composer_mic.mjs` |

**Host:** `git add` conflict resolutions, `git commit --no-edit` for merge; push once to `vkfill/859-20261110023051`.

## Left alone (scope)

- Baselines, Gate B capture, workflows, `package.json` / lock, evidence PNG churn.
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
