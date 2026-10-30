# #734 UI keep-PR 2 round 1 — lane receipt (HOST PUBLICATION ONLY)

**Start HEAD:** `1c7aead767036fef1c7b96c0d5f7685b5434b0c5` (unchanged; patch uncommitted on branch `vkfill/734-20261030101909`).

**Outcome:** `source-ready` — round-1 punch-list (B1–B6) + Gate B row logo/name fix (cars + flights); rebaked served bundle sha256 `d85925ee1ff5c321550b3d2e19e2ab0fd7cf90fdbf4a61905918659a5eefdf6c` on `public/assets/index-BKun7ofk.js`.

## Gate B row fix (host rowcheck reject → fix-3 PASS)

**Root cause:** Several car/flight favicons fail load in capture (`natural: [0,0]` in `rowcheck-0/cap/logo-log.json`); type-icon fallback used fixed `translateY(-2.5px)` instead of first name line. Live Hertz/Thrifty use vulcan 16×16 / 196×196 URLs missing from ink table.

**Fix:** `tsCenterThingLogoFallbackEl` aligns car/flight fallback emoji to `tsListRowFirstNameLineCenterY` (+3px car bias); other categories keep `-2.5px`. Ink table rows for Hertz/Thrifty/Dollar vulcan URLs; `listRowFirstNameLineCenterY` uses topmost client rect.

**Evidence:** `/home/ubishere9995/tsv-dispatch/bin/vk-live-row-check.sh` worktree → `rowcheck-fix-3/rowcheck.json` **PASS** (all 24 tab screens, empty `failing`).

## Changes (uncommitted)

| Row | What |
| --- | --- |
| B4 | View-only hides Edit caption (`Ce&&`); Play video uses `tsBoundMediaPlayUrl(gr)` not `gr.url`; `boundMediaPlayUrl` + bind handler normalize example.com/placeholder to `/api/bind-thing-media?…&raw=1` when `id` + `shareToken` present |
| B2 | `Pc()` never returns `"?"`; logo chip stacks fallback + img; car/flight fallback + ink rows align logo glyph to first name line (Gate B row) |
| B6 | Day-by-Day rows without time render `TBD` instead of empty string |
| B5 | Removed duplicate top `data-ts-detail-reviews` block from readonly detail patch |
| B1 | Bottom reviews keep `data-ts-review-stars` + star renderer; no `[x.r,"★"]` glyph block |

**Files:** `src/vacation/trek-ui-734-round1-patch.mjs` (new), `src/vacation/thing-media-bind.mjs`, `src/vacation/bind-thing-media-handler.mjs`, `src/vacation/trek-thing-detail-readonly-patch.mjs`, `src/vacation/thing-logo-ink-center.mjs`, `src/vacation/thing-logo-ink-offsets.json`, `src/vacation/trek-style2-bundle.mjs`, `public/assets/index-BKun7ofk.js`, `scripts/test_ui_734_round1_punchlist.mjs` (new), `scripts/offline-tests.txt`, `scripts/test_shared_logo_chip_center_bundle.mjs`, `scripts/test_thing_logo_ink_center.mjs`.

Rebake: `node scripts/rebake_served_trek_bundle.mjs`.

## Per-row evidence (unit / bundle @ rebake sha256 above)

| Row | Command | Result |
| --- | --- | --- |
| B4–B6, B5, B1 | `node scripts/test_ui_734_round1_punchlist.mjs` | **PASS** |
| B4 bind URL | `node scripts/test_bind_thing_media.mjs` | **PASS** |
| B2 logo chip | `node scripts/test_shared_logo_chip_center_bundle.mjs` + `node scripts/test_thing_logo_ink_center.mjs` | **PASS** |
| Gate B rows (cars/flights) | `vk-live-row-check.sh` → `rowcheck-fix-3/rowcheck.json` | **PASS** |

## Headless slug `8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y`

Not run in lane (no Chrome/preview harness wired for #734 round 1 in this job). Host: serve rebaked `dist` + run existing shared-trip chrome tests / Gate B on staging after push.

## Pre-DONE gates

| Gate | Result |
| --- | --- |
| `node scripts/test_offline_manifest.mjs` | **PASS** (373 offline / 17 online; `test_ui_734_round1_punchlist.mjs` registered) |
| `node scripts/check-no-comments.mjs` | **PASS** |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** |
| `node scripts/test_keepsake_style2.mjs` | **FAIL** — missing npm package `qrcode` (env; host `npm ci`) |

## Host publish

1. `npm ci`; rerun pre-DONE trio + keepsake test.
2. Commit listed files; push once; PR into `vk` with `Closes #734`.
3. CI + Gate B + shared slug headless on staging.

Not done: pushed PR head, CI green, Gate B PASS, merge.
