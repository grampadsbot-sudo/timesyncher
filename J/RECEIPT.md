# PR #872 — host vk merge + #865 / #870 / #877 / #882 (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready PATCH after `origin/vk` base merge (uncommitted; host commit). **Start HEAD:** `439d8234f0f8ecc14cdfe41a7c474e327198ee7d`. **Base merge:** host merged `origin/vk` at `412e26e95ae02b0e31c185896833cbc9d83e6e31` into `439d8234` (2026-11-09 ~1:40 PM PT). **Conflict:** `J/RECEIPT.md` only (resolved here).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-872`: **page_not_found** (brief HANDOFF FETCH FAILED).

## Issue #865 (PR intent; closes #865)

Divider full drag (`--site-height` / `--chat-height`, no `minmax(220px)` floor), full-width chat bubbles (`max-width: 100%`), header mic removed from shared-trip hero row (`TripHeaderActions` no `SharedAudioButton`); composer mic retained (`#voiceButton` in `vacation-app.html`). Offline: `test_vacation_app_865_chrome.mjs`. Gate B layout probes: `PUBLIC-NOMIC`, `SITE-BUBBLE-WIDTH`, divider + bubble shots in `test_served_page_layout.mjs`.

`public/ts-shared-audio-recorder.js`: wires existing `[data-ts-shared-audio]` only (no header auto-inject).

## Issue #870 (from vk merge; composer mic UX)

1. **`public/vacation-app-request.js` — `bindVoice`**
   - Inline composer errors via `showComposerStatus` (blocked mic, unsupported API, no-speech / aborted retry).
   - `try/catch` on `getUserMedia` and `recognition.start()`; `onerror` handler.
   - Fresh `SpeechRecognition` per recording; one `getUserMedia` stream per page session.
   - Recording timer `m:ss` on `#voiceElapsed` while active.

2. **`vacation-app.html`** — `#voiceElapsed` beside `#voiceButton` in `.voice-mic-wrap`.

3. **`scripts/test_issue_870_composer_mic.mjs`** — offline harness (timer, multi-tap, error paths).

## Issue #877 (from vk merge)

Fullscreen pic popup: `public/ts-pic-popup-viewer.js`, `list-row-pic-popup-audit.mjs`, `test_ui_877_pic_popup_media_strip*.mjs`.

## Issue #882 / view-only detail status (from vk merge)

`src/vacation/trek-thing-detail-viewonly-status-patch.mjs`, `trek-thing-detail-patches.mjs`, `scripts/test_ui_882_viewonly_detail_status.mjs`; Feature Map touch in `features/README.md`, `features/collaborators.md`.

## Issue #859 / #867 (from vk merge; chat itinerary edit)

`src/vacation/chat-itinerary-edit-intent.mjs` + coalesce/retry in `chat-itinerary-edit.mjs`; `scripts/test_chat_itinerary_edit.mjs`.

## Host base merge conflict resolution

| Path | Resolution |
| --- | --- |
| `J/RECEIPT.md` | Merged #872 (#865) receipt + vk #870/#877/#882 notes (this file). |
| `public/assets/index-BKun7ofk.js` | vk merge version + `node scripts/rebake_served_trek_bundle.mjs` → sha256 `ba0c78d60c2e3b597e9c16913f151a4404b73921e0bab718e80bfa876d246f8f`. |
| vk product paths | Pic-popup, chat-itinerary-edit, composer mic, trek view-only patch, offline test registrations (staged index from host merge). |
| `evidence/vacation-client-p2-3-day/*.png`, `evidence/vacation-client-p2-5-detail/*.png` | Minor pixel drift from local `npm ci` / client runs — host may `git checkout` unless keeping refreshed evidence. |

## Checks run (lane; HEAD `439d8234`)

| Check | Result |
| --- | --- |
| `timeout 90 node scripts/test_vacation_app_865_chrome.mjs` | PASS |
| `timeout 60 node scripts/test_issue_870_composer_mic.mjs` | PASS |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256=ba0c78d60c2e3b597e9c16913f151a4404b73921e0bab718e80bfa876d246f8f |
| `timeout 120 node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `timeout 90 node scripts/test_shared_trip_spa_console.mjs` | PASS (header mic absent) |
| `timeout 120 node scripts/test_ui_877_pic_popup_media_strip.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (431 offline, 18 online) |
| `node scripts/check-no-comments.mjs` | PASS (1118 files; after root `npm ci` + `apps/vacation-client` `npm ci`) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/test_served_page_layout.mjs` | **Host** Gate B structure (Chrome) |
| `cd apps/vacation-client && npm test` | **Host** pre-push (full client suite) |

## Uncommitted (host publish)

- Resolved `J/RECEIPT.md` (was `UU`; `git add` required)
- Merge-staged: pic-popup, chat-itinerary-edit, `public/assets/index-BKun7ofk.js`, `public/vacation-app-request.js`, `vacation-app.html`, `scripts/test_issue_870_composer_mic.mjs`, `scripts/offline-tests.txt`, trek #882 patch + test, feature map rows
- Rebaked bundle (post-rebake sha above) — ensure rebaked file included in merge commit
- Evidence PNGs (optional discard per table above)

## Host publish (merge commit)

`git add` conflict resolutions + index; `git commit --no-edit`; push once to `vkfill/865-20261109101932`. Run `node scripts/test_served_page_layout.mjs` and vacation-client `npm test` on host if not rerun here.

## WebKit note (#870)

After a full page reload, iOS may require a fresh mic allow prompt; within one session we reuse one `getUserMedia` stream and rebuild `SpeechRecognition` each tap.

## Not touched (scope)

Baselines, Gate B thresholds/allowlists, `package.json` / lockfile, NYC 8CQX trip data, deploy config, server STT.
