# PR #876 / #870 — composer mic (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready PATCH after `origin/vk` base merge (uncommitted; host commit). **Start HEAD:** `ec47398b8d39d2217c9947eff81b3cb0dc044896` (pre-merge PR head). **Base merge:** host merged `origin/vk` into `ec47398b` (includes #864 and vk tip product changes); sole conflict `J/RECEIPT.md`.

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
| `public/assets/*.js` | vk versions on disk; host rebakes with `node scripts/rebake_served_trek_bundle.mjs` when needed. |
| Other vk-staged paths (#877 pic viewer, dossier fill, etc.) | Merged clean from `origin/vk`; behaviour preserved per vk. |

## Checks run (this lane)

| Check | Result |
| --- | --- |
| `timeout 60 node scripts/test_issue_870_composer_mic.mjs` | PASS (0.03s wall; fake timers) |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256=6748012103be769972219c26b9406f943d410f6aae625b873ffb839fe96b8780 |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS (after `npm ci` root + `apps/vacation-client`) |
| `cd apps/vacation-client && timeout 900 npm test` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1114 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (429 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `timeout 3600 node scripts/run-offline-tests.mjs` | **PARTIAL** — fails at `scripts/test_live_transcript_dialog_pdf.mjs:651` (`gbrain-cli-get_page` vs `bundled-get_page`; lane env, unrelated to #870) |

## Uncommitted (host publish)

- `J/RECEIPT.md` (merge conflict resolved)
- Merge-staged vk paths: `basemerge.json`, pic-popup viewer, dossier fill, chat-itinerary-edit, offline-tests additions, `public/assets/index-BKun7ofk.js`, etc.
- Side effect: `evidence/vacation-client-p2-5-detail/*.png` updated by vacation-client layout tests (discard if host wants clean evidence tree)

## Gate B / screen_probe

**Host:** resolve/stage `J/RECEIPT.md`; `node scripts/rebake_served_trek_bundle.mjs` if rebake not yet on merge commit; complete merge commit; push `vkfill/870-20261109102834`; mark PR ready; CI + Gate B.

## WebKit note (PR)

After a full page reload, iOS may require a fresh mic allow prompt; within one session we reuse one `getUserMedia` stream and rebuild `SpeechRecognition` each tap.

## Not touched

Baselines, Gate B config, `package.json`, `scripts/offline-tests.txt` (vk merge may have updated list — do not revert), server STT, header mic (#865 scope).
