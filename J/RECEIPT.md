# PR #906 — #902 customer build stamp + vk merge conflict round

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `0ef05cdc97a57eb4b117c7bb48894fbd6deae925` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906`.

## Host base-merge: `origin/vk` @ `52d88438fefbb108ea67795faeeb08904b77f65c` into `0ef05cdc`

| Path | Resolution |
| --- | --- |
| `J/RECEIPT.md` | Merged both sides: #902 receipt + vk #939 hero title unclip carry (this file). |
| `public/ts-trip-hero-collapse.js` | vk carry: expanded `h1` uses `overflow-wrap:anywhere` (no expanded one-line clip); CSS grid chevron column; collapsed bar ≤57px with ellipsis. |
| `scripts/test_vacation_app_927_hero_collapse.mjs` | vk carry: dropped expanded one-line `clientHeight` and within-8px-height vs ed8687b; kept overlap, collapse metrics, expanded no-ellipsis, `scrollWidth <= clientWidth`. |

Product files auto-merged except this receipt. **#902 product code not re-authored** per handoff (`7a978cf3` Gate B PASS).

## #902 — hide customer-visible build stamp (on PR branch)

**Bug:** Dark fixed footer with 7-char build sha visible on hub, static pages, and trip React shell (390 + 1280).

| Piece | What |
| --- | --- |
| `routes/version.mjs` | Customer-hide asset URLs; visible bar only under `html[data-ts-debug-build]` (`?debug=1`). |
| Static HTML shells + `public/ts-build-stamp-customer-hide.{css,js}` | Hide `footer[data-build-stamp="1"]` by default. |
| `shared-app.html` | vk `#root` flex column shell **and** customer hide on stamp footer. |
| `apps/vacation-client/src/components/BuildStampFooter.tsx` | Mount stamp for DOM/meta probes; `data-ts-debug-build` when `?debug=1`. |
| `apps/vacation-client/src/styles.css` | Hide `.tsv-build-footer` unless `?debug=1`. |

`<meta name="timesyncher-build">` and `/api/version` unchanged. Gate B PASS on pre-merge head `7a978cf3` per handoff (capture `textContent` host fix).

## #939 carry — expanded hero title unclip (vk only in this merge)

**Authority:** eggbot 3:04 AM PT 11/10 (title clip ship-blocker; wrapping OK; ~32px shorter expanded OK).

| Piece | What |
| --- | --- |
| `public/ts-trip-hero-collapse.js` | See merge table above. |
| `scripts/test_vacation_app_927_hero_collapse.mjs` | See merge table above. |

**Out of scope (unchanged):** splitter, chat-edit, conflicts, trip data, `gateb-allow.json`, bundles (standalone `shared-app.html` script).

## Uncommitted source (host `git add` + merge commit)

- `J/RECEIPT.md` (conflict markers cleared)
- `public/ts-trip-hero-collapse.js`
- `scripts/test_vacation_app_927_hero_collapse.mjs`

**Host:** `git add` merge index + paths above, `git commit --no-edit` on `vkfill/902-20261109163213`; push once. Gate B structure + CI on new head.

## Checks @ `0ef05cdc` + vk merge working tree (lane END)

| Command | Result |
| --- | --- |
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** (after `npm ci` in worktree) |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | **PASS** |
| `node scripts/test_offline_manifest.mjs` | **PASS** (444 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | **PASS** (after `npm ci` at repo root + `apps/vacation-client`) |

Gate B structure on pushed head — host pipeline after push (`bot-admin/lanes/vk-pr-handoff/pr-906`).

## Left alone (scope)

- Baselines, Gate B capture scripts, workflows, `package.json` / lock, deploy config.
- #902 product code — no further coder round per handoff.
- Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
