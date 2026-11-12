# PR #970 round — vkfill-970 (composer-2.5, cursor-ubuntu)

Outcome: **source-ready** for host publication from starting HEAD `4f0fa505a4ad5499512a663a59cc5c10fd071b37`. Not CI-green or Gate B-complete on this pass; host must publish and re-run CI/Gate B.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-970`: **not found** on this pass (noted per brief).

## Root cause

1. **unit-tests** `scripts/test_shared_hotels_390_text_wrap.mjs`: `patchListRowDates` injected `tsListDateRange` before `be=`, outside the harness slice (`be=`…`,tt=G=>`). Puppeteer eval defined `Oe` without `tsListDateRange` in scope → `ReferenceError`. Harness expectations still assumed pre-v3 stars-right layout (#968 v3 = stars left, dates right).

2. **secrets** / `check-hardcoded-content`: `writtenDate` used a regex with literal month tokens (`Jan|Feb|…`) → `DATE-LITERAL` failures in `src/vacation/list-row-dates.mjs:22`.

## Source changes (uncommitted)

| File | Why |
| --- | --- |
| `src/vacation/list-row-dates.mjs` | Inject `tsListDateRange` immediately before `Oe=(G,Re,zt=!1)=>` so served bundle and hotel harness share scope; prose dates via `Intl` month index + `[A-Za-z]{3,9}` pattern (no month literals in source). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `07d223ae027b4983e2389d2ec348ea267904697a608fa4ddad0b31f12e545b56`). |
| `scripts/test_shared_hotels_390_text_wrap.mjs` | v3 row contract: stars-before-dates, price on name row; stub `la`/`Qa`/`Yi`/`Ar`/`hn`; allow ≤3 name lines for long hotel titles. |

## Checks (local, starting HEAD `4f0fa505`)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | exit 0 |
| `node scripts/test_served_star_rating_bundle.mjs` | exit 0 |
| `CHROME_PATH=/usr/bin/chromium-browser node scripts/test_shared_hotels_390_text_wrap.mjs` | exit 0 |
| `node scripts/test_check_hardcoded_content.mjs` | exit 0 |
| `node scripts/check-hardcoded-content.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `node scripts/test_offline_manifest.mjs` | exit 0 (455 offline, 21 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `npm run test:keepsake-style2` | exit 0 |

Pre-DONE gates above all pass on this dirty tree. No commit, stage, push, merge, rebase or deploy performed (HOST PUBLICATION ONLY).

## Left for host / out of scope

- Chief-dr **Gate B** list (32 structure PNGs + budget price/description completeness on NYC fixture): not re-run locally on this pass. Budget missing-price rows are **data/harness** (`gate-b-budget-price-completeness.mjs` / `budgetModel.mjs`), not addressed in this UI patch. Structure compares need host Gate B after publish.
- Acceptance **968** `topmost:false` visibility (split-pane scroll): unchanged; product brief scoped row layout only.

## Host next

One ff push to `vkfill/968-20261112114229`, refresh PR #970, wait for CI. If unit-tests + secrets green, chase Gate B structure + DATA prices on authorized follow-up.
