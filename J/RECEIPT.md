# PR #895 / #890 — vkfill-890 cursor-ubuntu round (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted). **Start HEAD:** `592072fff684ed76e8afb1b77b386431dc9a00ab` (repo `grampadsbot-sudo/timesyncher`, branch `vkfill/890-20261109141646`).

## Changes

1. **`scripts/test_purchase_launch_routes.mjs`** — Craig-ordered rebrand (pt3133u): assert purchase route HTML title/body uses `Vacay Keepsake App` instead of `TimeSyncher Vacation App`; home marketing page asserts `Vacay Keepsake` instead of `TimeSyncher` (strict `assert.match`, not removed).

2. **`public/ts-shared-audio-recorder.js`**, **`public/ts-shared-audio-recorder.css`** — Reverted to merge-base with `origin/vk` (`4e0be3f` ancestry) per lane brief: drops PR-local floating FAB (`ts-shared-audio-button--fab`, body append, header scrub). Header-mic policy remains with PR #872 on base `vk`; this PR must not carry conflicting audio-recorder edits.

## Uncommitted files (host commit/push)

| Path |
| --- |
| `scripts/test_purchase_launch_routes.mjs` |
| `public/ts-shared-audio-recorder.js` |
| `public/ts-shared-audio-recorder.css` |

## Checks run (start HEAD 592072ff)

| Check | Result |
| --- | --- |
| `node scripts/test_purchase_launch_routes.mjs` | PASS (was CI `unit-tests` first failure) |
| `node scripts/test_keepsake_style2.mjs` | PASS |
| `node scripts/test_vacation_app_shell.mjs` | PASS (Vacay Keepsake shell strings) |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_check_code_ratchet.mjs` (via offline manifest runner) | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1120 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (430 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/run-offline-tests.mjs` (full lane) | FAIL local only: `scripts/test_live_transcript_dialog_pdf.mjs:651` expects `bundled-get_page` but lane has `gbrain` on PATH (`~/.bun/bin/gbrain`); GitHub `ubuntu-latest` unit-tests step has no `gbrain` CLI — same assertion passes there |

## Rebrand / header (product already on head; verified via shell test)

- `test_vacation_app_shell.mjs` PASS: `Vacay Keepsake App`, wordmark, no `TimeSyncher Vacation Setup` on shell surfaces covered by test.
- No `vacation-app.html` line growth this round.
- 390+1280 visual capture / header-mic proof: **host rowcheck** after push (blocking hold until capture shows no mic in site header bar).

## Scope left alone

Baselines/evidence PNGs (reverted accidental local drift), Gate B config, `offline-tests.txt`, workflows, `package.json`, trek rebake, NYC fixtures.

## Host next

Commit three files → ff push once → confirm CI `unit-tests` green on new head → structure Gate B + 390/1280 capture (header logo-left / switcher-right, no TimeSyncher visible brand, no header mic).
