# vkfill-870 lane receipt (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready PATCH on disk (uncommitted). **Starting HEAD:** `b2b8bbc076fcae30da54aa43f878cd3bd9178900` (ref: branch `vkfill/870-20261109102834`).

## Changes (#870)

1. **`public/vacation-app-request.js` — `bindVoice`**
   - Inline composer errors via `showComposerStatus`: blocked mic (iPhone Settings › browser › Microphone vs desktop site settings), unsupported API, no-speech / aborted retry copy.
   - `try/catch` on `getUserMedia` and `recognition.start()`; `onerror` handler (no silent mic tap).
   - Fresh `SpeechRecognition` per recording; `getUserMedia` once per page session (stream reused).
   - Recording timer `m:ss` on `#voiceElapsed` while the mic is active.

2. **`vacation-app.html`**
   - `#voiceElapsed` beside `#voiceButton` in `.voice-mic-wrap` + minimal CSS.

3. **`scripts/test_issue_870_composer_mic.mjs` (new, untracked)**
   - Offline harness: three recordings one session, single `getUserMedia`, timer tick, `NotAllowedError`, iPhone blocked copy, `no-speech`, unsupported API.

## Uncommitted files

```
public/vacation-app-request.js
vacation-app.html
scripts/test_issue_870_composer_mic.mjs
```

**Host must add** `scripts/test_issue_870_composer_mic.mjs` to `scripts/offline-tests.txt` (coder brief bans editing that manifest).

## Checks run (this lane)

| Check | Result |
|-------|--------|
| `node scripts/test_issue_870_composer_mic.mjs` | PASS |
| `node scripts/test_vacation_app_client_errors.mjs` | PASS |
| `node scripts/test_vacation_app_shell.mjs` | **SKIP** — no `node_modules` / `@neondatabase/serverless` in worktree |
| `node scripts/check-no-comments.mjs` | **SKIP** — missing `apps/vacation-client/node_modules/typescript` |
| `node scripts/test_offline_manifest.mjs` | **SKIP** — pending offline-tests registration |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (0 fail) |

## Host next

- Register test in `scripts/offline-tests.txt`; `npm ci` if needed; run pre-DONE gates.
- Commit + push one PR into `vk` with `Closes #870`.
- Self-verify: screenshots at 390 (+1280) for recording timer, second consecutive recording, permission error; Gate B / CI green.
- **WebKit note (PR):** After a full page reload, iOS may require a fresh mic allow prompt; within one session we reuse one `getUserMedia` stream and rebuild `SpeechRecognition` each tap.

## Not touched

Baselines, Gate B config, `package.json`, TREK 8CQX, server STT, header mic (#865 scope).
