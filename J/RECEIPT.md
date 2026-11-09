# PR #876 / #870 — composer mic (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready PATCH after `origin/vk` base merge (uncommitted; host commit). **Start HEAD:** `cb6b4c6316202e99fdaec6051150573db913595b`. **Base merge:** host merged `origin/vk` @ `79dce6ae` (includes #861 chat itinerary undo from vk).

## Changes (#870)

1. **`public/vacation-app-request.js` — `bindVoice`**
   - Inline composer errors via `showComposerStatus`: blocked mic (iPhone Settings › browser › Microphone vs desktop site settings), unsupported API, no-speech / aborted retry copy.
   - `try/catch` on `getUserMedia` and `recognition.start()`; `onerror` handler (no silent mic tap).
   - Fresh `SpeechRecognition` per recording; `getUserMedia` once per page session (stream reused).
   - Recording timer `m:ss` on `#voiceElapsed` while the mic is active.

2. **`vacation-app.html`**
   - `#voiceElapsed` beside `#voiceButton` in `.voice-mic-wrap` + minimal CSS.

3. **`scripts/test_issue_870_composer_mic.mjs`**
   - Offline harness: fakes `getUserMedia` / `SpeechRecognition`; controlled fake `Date` + `setInterval` for timer; 20s hard timeout; three recordings one session, single `getUserMedia`, timer tick, `NotAllowedError`, iPhone blocked copy, `no-speech`, unsupported API.

## Base merge (vk)

| File | Resolution |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs` | Kept vk (#861 undo client shape + `nothing_to_undo`). |
| `scripts/test_chat_itinerary_edit.mjs` | Kept vk expanded tests. |
| `J/RECEIPT.md` | This file (#870 receipt + merge note). |
| `public/assets/*.js` | vk versions on disk (no hand-merge). |

## Checks run (this lane)

| Check | Result |
| --- | --- |
| `timeout 60 node scripts/test_issue_870_composer_mic.mjs` | PASS (~0.05s wall; fake timers) |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `cd apps/vacation-client && timeout 900 npm test` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1111 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (427 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `scripts/offline-tests.txt` sweep (timeout 120 each) | **PARTIAL** — stopped at #113 `scripts/test_live_transcript_dialog_pdf.mjs`: expects `bundled-get_page`, got `gbrain-cli-get_page` (lane env; unrelated to #870) |

## Uncommitted diff for host

```
J/RECEIPT.md                          (conflict resolved)
scripts/test_issue_870_composer_mic.mjs (timeout + fake timers)
scripts/test_chat_itinerary_edit.mjs    (staged from vk)
src/vacation/chat-itinerary-edit.mjs    (staged from vk)
```

**Host:** `git add J/RECEIPT.md scripts/test_issue_870_composer_mic.mjs`; complete merge commit; push `vkfill/870-20261109102834`; mark PR ready; CI + Gate B.

## WebKit note (PR)

After a full page reload, iOS may require a fresh mic allow prompt; within one session we reuse one `getUserMedia` stream and rebuild `SpeechRecognition` each tap.

## Not touched

Baselines, Gate B config, `package.json`, `scripts/offline-tests.txt`, TREK 8CQX rebake (no bundle source conflict), server STT, header mic (#865 scope).
