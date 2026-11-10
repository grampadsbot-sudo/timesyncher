# PR #906 — #902 customer build stamp + host `origin/vk` merge (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (host commit + push). **Start HEAD:** `026a586cff9c7efd4e8e9be0255afc0ef110f1a4` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906` — page_not_found on this pass (per lane brief).

Host merged `origin/vk` at `85fae5b37a899e737b570b71d052def772d42b16` into `026a586c`. Conflicted file: `J/RECEIPT.md` only — resolved here keeping PR #906 intent (#902) and vk port/data from the merge index.

## #902 — hide customer-visible build stamp

**Bug:** Dark fixed footer with 7-char build sha visible on hub, static pages, and trip React shell (390 + 1280).

**Fix (on branch + this round):**

| Piece | What |
| --- | --- |
| `routes/version.mjs` | `BUILD_STAMP_INLINE_STYLE` + customer-hide asset URLs; visible bar only under `html[data-ts-debug-build]` (`?debug=1`). |
| Static HTML shells | `ts-build-stamp-customer-hide.{css,js}` linked; inline `timesyncher-build-stamp-style` hides `footer[data-build-stamp="1"]` by default. |
| `apps/vacation-client/src/components/BuildStampFooter.tsx` | Always mount stamp footer for DOM/meta probes; sets `data-ts-debug-build` when `?debug=1`. |
| **`apps/vacation-client/src/styles.css` (this round)** | Hide `.tsv-build-footer` in the bundled client CSS (not only via external hide sheet) so the React trip shell never paints the dark bar without `?debug=1`. |

`<meta name="timesyncher-build">` and `/api/version` unchanged.

## Merged from `origin/vk` (staged index; behaviour kept)

| Area | Notes |
| --- | --- |
| #901 trip 99 stand-ins | Fixture/SQL/JSON + `trip99-thing-standin-check.mjs`, `test_issue_901_trip99_single_venue_standins.mjs`, capture pre-data hook |
| #905 chat itinerary (already on `026a586c` history) | `chat-itinerary-edit*.mjs`, `DayTimeline.tsx`, `test_chat_itinerary_edit_905.mjs`, etc. |
| `vacation-app.html` | Composer `showComposerStatus(customerSafeErrorMessage` catch (vk #913) |

`node scripts/rebake_served_trek_bundle.mjs` — run after client CSS change; no uncommitted `public/assets` delta vs index on this pass.

## Uncommitted / host publish scope

- `J/RECEIPT.md` (this file; conflict markers cleared)
- `apps/vacation-client/src/styles.css` (#902 bundled hide)
- Staged merge paths (`git diff --cached`) from host base merge
- Host: `git add J/RECEIPT.md apps/vacation-client/src/styles.css`, finish merge commit if index mid-merge, one push to `vkfill/902-20261109163213` (PR #906)

## Checks @ `026a586c` + conflict resolution + `styles.css`

| Command | Result |
| --- | --- |
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | **PASS** |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | **PASS** |
| `node scripts/test_chat_itinerary_edit_905.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** (1129 files; `apps/vacation-client/npm ci` first) |
| `node scripts/test_offline_manifest.mjs` | **PASS** (437 offline, 18 online) |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | **PASS** (252 report, 0 fail) |

Gate B structure / host capture / evidence `J/evidence/hub-390.png` + `hub-1280.png` — host pipeline after push.

## Left alone (scope)

- Baselines, Gate B capture scripts, workflows, `package.json` / lock, deploy config.
- Neon apply for `J/trip99-change.sql` (host).

**Host:** commit, push PR #906, CI + Gate B on build-stamp screens; Keepsake QA not run (lean mode).
