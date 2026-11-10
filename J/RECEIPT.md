# PR #906 / #902 — hide build-stamp bar + vk merge residue

**Outcome:** source-ready PATCH (host publication). **Start HEAD:** `5eb5989f26c39806e7f52df57555d44216df1b6d`.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906` — page_not_found on this pass (noted per lane brief).

## #902 — hide customer-visible build stamp

**Bug:** Dark fixed footer with 7-char build sha visible on hub/checkout/static pages and trip shell (390 + 1280).

**Fix (this round):**
1. **`routes/version.mjs`** — `BUILD_STAMP_INLINE_STYLE`: vite-injected `timesyncher-build-stamp-style` hides footer by default; visible fixed bar only under `html[data-ts-debug-build]` (`?debug=1` via `ts-build-stamp-customer-hide.js`).
2. **`vite.config.mjs`** / **`scripts/layout-shell-harness.mjs`** — use shared inline style (no always-visible bar before external CSS loads).
3. **`apps/vacation-client/src/components/BuildStampFooter.tsx`** — always mount hidden stamp footer; `data-ts-debug-build` when `?debug=1`.
4. **`vacation-app-next.html`** — customer-hide assets + debug-only visible CSS; link `/ts-build-stamp-customer-hide.{css,js}`.

Meta `timesyncher-build` + `/api/version` unchanged. Existing `public/ts-build-stamp-customer-hide.*` retained as belt-and-suspenders.

## Merged from origin/vk (host merge @ `5eb5989f`; keep behaviour)

1. **#890 rebrand** — Vacay Keepsake chrome, `trek-vk-890-rebrand-patch.mjs`, brand assets, `ts-vk-rebrand-chrome.js`, mic inject removed from shared audio recorder wiring.
2. **`scripts/test_shared_trip_spa_console.mjs`** — mock server serves vk rebrand static paths (`/brand/*`, favicon, etc.).
3. **`src/vacation/shared-trip-dossier-overlay.mjs`** / **`intake-shared-trip.mjs`** — address overlay rules + dossier hydrate fixture updates (from vk).
4. **`scripts/test_vkprloop_drift_910.mjs`** + fixture (vk).

## Uncommitted (host commit scope)

All paths in `git status` after this round, including `J/RECEIPT.md` (merge conflict resolved here). Host: finish merge commit if needed, `node scripts/rebake_served_trek_bundle.mjs` if bundle drift, one push to `vkfill/902-20261109163213` (PR #906).

## Checks run @ `5eb5989f` + patch

| Command | Result |
|---|---|
| `node scripts/test_build_stamp_customer_hidden.mjs` | **PASS** |
| `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs` | **PASS** (inline hide + harness wait on stamp footer) |
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** |
| `node scripts/test_offline_manifest.mjs` | **PASS** (435 offline, 18 online) |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | **PASS** (pre-DONE r1: `index.html` `</style>` + customer-hide assets on one line → 941 lines) |

Gate B / host capture / Keepsake QA live+PDF — not run (lean mode; host pipeline).

## Left alone (scope)

- Baselines, Gate B capture scripts, `.github/`, `package.json` / lock, deploy config.

**Host:** commit, push PR #906, CI + Gate B structure on build-stamp screens.
