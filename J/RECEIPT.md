# PR #906 / #902 — hide build-stamp bar + vk merge residue

**Outcome:** source-ready PATCH (host publication). **Start HEAD:** `2ffe6485b6667bc8ec4bdbc7dcc2ad671a917486`.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-906` — page_not_found on this pass (noted per lane brief).

## This round (#902)

CI `unit-tests` failed: `apps/vacation-client/test/shell-layout.mjs` expected `footer[data-build-stamp="1"]` present with `visibility: hidden` when `data-ts-embed` is set; `BuildStampFooter` returned `null` for non-`?debug=1`.

**Fix:** `apps/vacation-client/src/components/BuildStampFooter.tsx` — always mount hidden stamp footer (fetch `/api/version` for 7-char text); set `data-ts-debug-build` on `<html>` only when `?debug=1`. `vacation-app-next.html` — debug-only visible stamp CSS aligned with `ts-build-stamp-customer-hide.css`.

## Merged from origin/vk (host merge @ `2ffe6485`; keep behaviour)

1. **`src/vacation/shared-trip-dossier-overlay.mjs`** — specific stored street address wins over neighborhood-only overrides.
2. **`src/vacation/intake-shared-trip.mjs`** — do not overwrite specific override address with non-specific trip-row address.
3. **Fixtures** — street addresses / flight route rows (gate-b staging, pr336 snapshot, nyc_ccab enrichment).
4. **`scripts/test_dossier_evidence_hydrate_682.mjs`** — Park Central overlay regression.

Prior #902 receipt (eslint `react-hooks/set-state-in-effect`): lazy `useState` for `?debug=1` retained.

## Uncommitted (host commit scope)

- `apps/vacation-client/src/components/BuildStampFooter.tsx`
- `vacation-app-next.html`
- `J/RECEIPT.md` (this file; merge conflict resolved)
- Plus staged vk-merge paths already in index per `git status` (dossier, fixtures, header chrome, etc.) — host reconciles one commit.

## Checks run @ `2ffe6485` + this patch

| Command | Result |
|---|---|
| `node apps/vacation-client/test/shell-layout.mjs` | **PASS** (CI repro) |
| `npm run lint` (vacation-client) | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/test_build_stamp_viewport.mjs` | SKIP — no `google-chrome-stable` on lane host |

Host should run `test_build_stamp_customer_hidden.mjs` + viewport test on CI/Ubuntu with Chrome.

## Left alone (scope)

- Baselines, Gate B capture, `offline-tests.txt` / workflow edits unless host registers tests.
- Served `public/assets/*` rebake — host takes vk bundle + `node scripts/rebake_served_trek_bundle.mjs` if still required post-merge.

**Host:** resolve merge commit if needed, commit, push `vkfill/902-20261109163213` (PR #906), CI + Gate B.
