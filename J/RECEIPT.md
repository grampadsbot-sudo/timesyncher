# PR #912 / #890 — vkfill-890 port onto vk (cursor round)

**HEAD start:** `3a66ce9ad349579bf521a65546f6a28164a0acf1` (verified before edit)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-912` — page_not_found on this pass (noted per lane brief).

## Assessment

PR branch `vkfill/890-port-20261110012727` already carries the #895 rebrand replay (`59948969`, `2a6b78d8`): Vacay Keepsake surfaces, `trek-vk-890-rebrand-patch.mjs`, served bundle rebaked, header mic inject removed from `public/ts-shared-audio-recorder.js` (wires only pre-existing `[data-ts-shared-audio]`; `TripHeaderActions` has no `SharedAudioButton`).

**Gap found:** `scripts/test_shared_trip_spa_console.mjs` mock static server did not serve `#890` assets referenced from `shared-app.html` (`/brand/*`, `/ts-vk-rebrand-chrome.js`, `/favicon.ico`), causing console 404 failures after rebrand HTML landed on vk.

## Changes (uncommitted; host publication only)

1. **`scripts/test_shared_trip_spa_console.mjs`** — Extend `publicFiles` map and MIME selection so the puppeteer harness serves vk rebrand static assets; no assertion or product change.

## Checks run @ `3a66ce9a` + local patch

| Command | Result |
|---|---|
| `node scripts/test_shared_trip_spa_console.mjs` | pass (header mic absent; no origin 404 console errors) |
| `node scripts/test_vacation_app_865_chrome.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `npm run test:keepsake-style2` | pass |
| `node scripts/test_offline_manifest.mjs` | pass (433 offline, 18 online) |

`node scripts/check-no-comments.mjs` — blocked locally (`apps/vacation-client/node_modules/typescript` missing); host should run pre-DONE on full checkout.

Gate B / host capture / Keepsake QA live+PDF — not run (Cursor must not self-certify; host publish + pipeline).

## Host receipt path

Detail: `/home/ubishere9995/tsv-work/vkfill-890-20261109180801-job/vkfill-890-RECEIPT.md`

**DONE file:** see `vkfill-890-DONE` in job dir (written by this round).

## Left alone (scope)

- No rebake (bundle already matches patcher).
- Fixtures, dossier overlay, budget row-check capture, baselines, workflows, `package.json`, deploy config.
- `features/voice-note.md` still documents header mic (stale vs #865 rule); feature doc only.
