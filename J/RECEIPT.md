# PR #872 / Issue #865 — divider, header mic, full-width bubbles (cursor-ubuntu)

Start HEAD: `b5e64b81b1c31ed8d2fea5220e38f4a78beb2dde` (launch-identity.json `vkfill-865-20261109104043-job`).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-872`: **page_not_found** (checked via brief HANDOFF FETCH FAILED).

## Prior host publish (b5e64b81)

Already on PR head `b5e64b81`: vacation app splitter drag to full top/bottom (`public/vacation-app-request.js`, `vacation-app.html` CSS vars), chat bubbles `max-width: 100%`, `scripts/layout-app-measure.mjs` divider/bubble/header probes, `test_served_page_layout.mjs` Gate B ids, `ts-shared-audio-recorder.js` no auto-inject, offline test `test_vacation_app_865_chrome.mjs`.

## Gap this round

`TripHeaderActions.tsx` still mounted `SharedAudioButton` (header mic) while committed `public/assets/index-BKun7ofk.js` and tests expect no `[data-ts-shared-audio]` in the shared SPA — source/bundle drift on the next client rebuild.

## Patch (uncommitted; HOST PUBLICATION ONLY)

| Path | Change |
| --- | --- |
| `apps/vacation-client/src/components/TripHeaderActions.tsx` | Remove `SharedAudioButton` from shared-trip header hero row (#865). Composer mic unchanged (`vacation-app.html` `#voiceButton`). |
| `features/header-chrome.md` | Feature map: header row has no mic; voice on app composer. |
| `scripts/test_vacation_app_865_chrome.mjs` | Assert `TripHeaderActions` has no `SharedAudioButton` / `data-ts-shared-audio`. |

## Local proof (uncommitted on `b5e64b81`)

| Command | Result |
| --- | --- |
| `node scripts/test_vacation_app_865_chrome.mjs` | PASS |
| `node scripts/test_shared_trip_spa_console.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (425 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (0 fail) |

`node scripts/test_served_page_layout.mjs` **not run** here: Chrome missing at `/usr/bin/google-chrome-stable` (host/Gate B environment).

## Host publish

3 files in `/home/ubishere9995/tsv-work/vkfill-872-20261109104043`. Commit on `vkfill/865-20261109101932`, push once, re-run CI + structure Gate B (divider 390/1280, `PUBLIC-NOMIC`, `SITE-BUBBLE-WIDTH`). No bundle rebuild required for mic removal (committed bundle already omits header mic).
