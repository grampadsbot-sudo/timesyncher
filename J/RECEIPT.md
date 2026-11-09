# PR #872 / Issue #865 — divider, header mic, full-width bubbles (cursor-ubuntu)

Start HEAD: `6575eb0fc80068af811b6f9af912b48021af0f27` (lane `vkfill-865-20261109112837-job`).

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-872`: **page_not_found** (brief HANDOFF FETCH FAILED).

## On PR head (6575eb0f)

Divider full drag, full-width chat bubbles, header mic removed from `TripHeaderActions.tsx`, `test_vacation_app_865_chrome.mjs`, `features/header-chrome.md` — committed at `6575eb0f`.

## CI gap (unit-tests)

`scripts/test_keepsake_style2.mjs` failed: `public/ts-shared-audio-recorder.js` lost `Record voice note` when #865 stubbed `installButton()` to `return true` only (no header auto-inject).

## Patch (uncommitted; HOST PUBLICATION ONLY)

| Path | Change |
| --- | --- |
| `public/ts-shared-audio-recorder.js` | Wire existing `[data-ts-shared-audio]` buttons with aria/title `Record voice note` + `beginRecording`; MutationObserver until present. No `dataset.tsSharedAudio = '1'` create/insert (header inject stays removed). |

## Local proof (uncommitted on `6575eb0f`)

| Command | Result |
| --- | --- |
| `node scripts/test_keepsake_style2.mjs` | PASS |
| `node scripts/test_vacation_app_865_chrome.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (425 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (0 fail) |

`node scripts/test_served_page_layout.mjs` / Gate B structure probes **not run** here (Chrome not on PATH).

## Host publish

1 file: `public/ts-shared-audio-recorder.js` in worktree `vkfill-872-20261109112837`. Commit on `vkfill/865-20261109101932`, push once, re-run CI. Structure Gate B on host (divider, `PUBLIC-NOMIC`, `SITE-BUBBLE-WIDTH`).
