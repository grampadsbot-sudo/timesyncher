# PR #876 / #870 — composer mic (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready PATCH after `origin/vk` base merge (uncommitted; host commit). **Start HEAD:** `73d22a93fcd49facea15261531e08528589baf15`. **Base merge:** host merged `origin/vk` at `db5f9ee883a513cdb479f706354d4eae25725159` into `73d22a93` (2026-11-09 ~12:58 PM PT).

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

## Host base merge conflict resolution

| File | Resolution |
| --- | --- |
| `J/RECEIPT.md` | Kept #870 receipt (this file) + merge note. |
| `evidence/vacation-client-836-nyc-tabs/*.png`, `evidence/vacation-client-p2-6-keepsake/keepsake-1280.png` | vk (`origin/vk`) blobs — no new evidence from this round. |
| `src/vacation/chat-itinerary-edit.mjs`, `chat-itinerary-edit-intent.mjs`, `scripts/test_chat_itinerary_edit.mjs` | vk merge (clean). |
| `public/ts-pic-popup-viewer.js`, `list-row-pic-popup-audit.mjs`, `test_ui_877_*` | vk #877 (clean). |
| `public/assets/*.js` | vk versions on disk; rebake via `node scripts/rebake_served_trek_bundle.mjs`. |

## Checks run (this lane)

| Check | Result |
| --- | --- |
| `timeout 60 node scripts/test_issue_870_composer_mic.mjs` | PASS (wall=0.03s) |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256=6748012103be769972219c26b9406f943d410f6aae625b873ffb839fe96b8780 |
| `timeout 120 node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `cd apps/vacation-client && timeout 900 npm test` | PASS |
| `timeout 120 node scripts/test_ui_877_pic_popup_media_strip.mjs` | PASS |
| `timeout 120 node scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1115 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (429 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

## Uncommitted (host publish)

- `J/RECEIPT.md` (conflict resolved; `git add` required)
- Evidence PNGs (vk side; `git add` required for AA/UU rows)
- Merge-staged vk paths: pic-popup, chat-itinerary-edit, `public/assets/index-BKun7ofk.js`, etc.
- Side effect (vacation-client layout tests): `evidence/vacation-client-p2-3-day/*.png`, `evidence/vacation-client-p2-5-detail/*.png` — discard unless host wants updated evidence

## Gate B / screen_probe

**Host:** `git add` conflict resolutions; `node scripts/rebake_served_trek_bundle.mjs` if needed; `git commit --no-edit`; push `vkfill/870-20261109102834`; CI + Gate B on new head lifts `hold:test-trip-fixture` when live data stable.

## WebKit note

After a full page reload, iOS may require a fresh mic allow prompt; within one session we reuse one `getUserMedia` stream and rebuild `SpeechRecognition` each tap.

## Not touched

Baselines, Gate B config, `package.json`, NYC trip fixture data, server STT, header mic (#865 scope).
