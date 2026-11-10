# PR #940 — #859 chat edit + vk base merge

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `9ec105f0dd8421e1900aebd36f4a39e430e907f1` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-940`.

## Host base-merge: `origin/vk` @ `6017b330d9e07a5574d6432b9c489fe5f179ed53` into `9ec105f0`

| Path | Resolution |
| --- | --- |
| `J/PR_DESCRIPTION.md` | Merged both sides: #859 summary + vk carry (#888, #884, #927, #941, …). |
| `J/RECEIPT.md` | This file (conflict markers cleared). |
| `evidence/vacation-client-p2-5-detail/detail-enriched-bar-1280.png` | `origin/vk` (stage 3). |
| `evidence/vacation-client-p2-6-keepsake/keepsake-390.png` | `origin/vk` (stage 3). |
| `public/assets/index-BKun7ofk.js` | `origin/vk` then `node scripts/rebake_served_trek_bundle.mjs`. |
| `scripts/test_chat_itinerary_edit.mjs` | PR #859 assignment-move + vk #941 queue assertions; 413 cases in `_905.mjs`. |
| `scripts/offline-tests.txt` | Both `test_issue_888_clipped_text.mjs` and vk offline tests retained. |
| `trek-live-product-patches.mjs`, `trek-live-product-flight-day-patches.mjs` | PR conflict-wrap + vk car/budget/timeline patches. |
| `public/vacation-app-request.js` | vk #941: hide mic at rest when SpeechRecognition missing. |
| `src/vacation/chat-itinerary-edit-day.mjs` | vk #941 demo lock extra + assignment-based day resolve. |
| `src/vacation/chat-itinerary-edit.mjs` | #859 assignment/bounded queue + vk #941 authoritative reply. |

## Issue #859 — chat itinerary edit

### Root cause

1. **set_time / “Move Carbone to Day 2”:** `applySetTimeOp` wrote overrides only; no TREK assignment move. Timeline stayed on Day 1 while chat returned success.
2. **add_bar_before / turn 2 hang:** Unbounded post-generation rewrite/ship gate could hit 60s Vercel limit.
3. **Day resolution:** `placeOnDay` treated override-only `dayIds` as on-day.

### Fix (product)

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

## Vk merge carry — #888 flight @390 + #941 mic

At 390px, flight list cards keep departure and arrival inside the card (`apps/vacation-client/src/styles.css`, `ISSUE_888_SERVED_LAYOUT_CSS`).

- `public/vacation-app-request.js`: hide `#voiceButton` when constructors missing.
- `scripts/test_issue_870_composer_mic.mjs`: mic hidden + post-tap unsupported assertions.
- Demo-locked queue turns: authoritative lock wording (no invented itinerary facts).

## Checks (conflict-resolution tree, 2026-11-10 UTC)

```text
timeout 120 node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
node scripts/test_issue_888_clipped_text.mjs
node scripts/test_issue_870_composer_mic.mjs
node scripts/test_served_trek_bundle.mjs
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
| `node scripts/rebake_served_trek_bundle.mjs` | ok sha256 `31e18ae6bc65be8d1380f39abaa5f51af7ef58ef9d771cbedd54d42c4d29c128` |
| `node scripts/test_served_trek_bundle.mjs` | ok |
| `cd apps/vacation-client && timeout 900 npm test` | ok |
| `node scripts/check-no-comments.mjs` | ok (1150 files) |
| `node scripts/test_offline_manifest.mjs` | ok (446 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | ok (251 report, 0 fail) |

Not run: Gate B, live two-turn proof (`lanes/jobs/chat-edit-live-proof-940-20261110-0331/watch940.py`).

## Uncommitted source for host

| Path | Note |
| --- | --- |
| `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` | Conflict resolved |
| `public/assets/index-BKun7ofk.js` | Rebaked after vk take |
| `evidence/.../detail-enriched-bar-1280.png`, `keepsake-390.png` | vk versions |
| Merge tree paths | `styles.css`, trek patches, offline-tests, vacation-app.html, evidence churn |

**Host:** `git add` conflict resolutions, `git commit --no-edit` for merge; push once to `vkfill/859-20261110023051`.

## Left alone (scope)

- Baselines, Gate B capture, workflows, `package.json` / lock except `npm ci` for tests.
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
