## Host-reviewed source candidate — U2–U5

Starting HEAD `04e5f55e5c7c8a4ca4bc39e96c306214cd53711d`; uncommitted candidate PATCH sha256 `381c3ef1e6df5c10eda0eaf746a6255edbefc13e2a575c9df3dd42f99fc305bd`. Center tab vector icon slots without a fixed nudge; align single-time timeline baselines; wrap list names and stored summaries while preserving prices; use the shared sourced-logo resolver in server and preview list lookup. Regenerate the served bundle with the maintained builder. U1 stars remain a regression gate.

Validation: 14 focused checks, production build with the starting SHA input, no-comments (872 files), offline manifest (297/17), and code ratchet (255 reports/0 failures) exited 0. New runtime cases exercise actual emitted timeline and compact/expanded hotel rows. No assertion/check was relaxed.

Acceptance pending: current fixture fails pre-data checks (21 hotel-description and 31 price failures); approved baseline manifest absent; local browser diagnostic timed out before tabs (0 screenshots). No new-head CI, named 32-screen Gate B, live/PDF QA or U-row acceptance is claimed. No source PR was closed. Host alone publishes. Full receipt: J/RECEIPT.md.

<!-- CURSOR_AGENT_PR_BODY_BEGIN -->
Closes #689

## Gate B fix-it (head `04e5f55e`)

### Root cause
1. **Tabs missing (hotels/cars/… capture failed)** — In `Oe()` list-row renderer, `sr=` referenced `tsRowStars` / `tsRowRating` **before** they were declared (`const` TDZ → `ReferenceError` when lists rendered, React tree failed, tab chrome never mounted).
2. **Grey full stars (`rgb(107,114,128)` / `#6b7280`)** — Injected star SVGs used `fill="currentColor"` but live shared trek has no global `.ts-star-full` CSS; stars inherited muted label grey instead of gold.

### Fix
- **`trek-star-rating-patch.mjs`**: Declare `tsRowRating` / `tsRowStars` immediately after `Pn=(Mi(G),Rn),` and **before** `sr=`; revert the broken late declaration on the `Xr=fo(G)` line.
- **`star-rating-model.mjs`**: Shared `renderStarRatingHtml` + trek inject use explicit `fill="#f59e0b"` (gold) and `fill="#e5e7eb"` (empty/half track) on paths — one module for web + PDF HTML.
- Rebaked **`public/assets/index-BKun7ofk.js`**.

### Checks run locally
| Command | Result |
|---------|--------|
| `node scripts/test_star_rating_model.mjs` | pass (incl. `fill="#f59e0b"`) |
| `node scripts/test_served_star_rating_bundle.mjs` | pass (Oe var order + rebake parity) |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |

### Left alone (scope)
Baselines, Gate B/capture scripts, thresholds/allowlists, workflows, `offline-tests.txt` (no new tests), deploy config, dependencies, vacation-client preview-only paths beyond shared model re-export.

### For pipeline
Re-run Gate B on `04e5f55e` — expect tabs to mount and star pixels gold on 390/1280 shared route.
<!-- CURSOR_AGENT_PR_BODY_END -->

<div><a href="https://cursor.com/agents/bc-21db247f-bcb7-5165-a17e-fae39e201274?cursor_ref=pr_footer&cursor_cta=open_in_web"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cursor.com/assets/images/open-in-web-dark.png"><source media="(prefers-color-scheme: light)" srcset="https://cursor.com/assets/images/open-in-web-light.png"><img alt="Open in Web" width="114" height="28" src="https://cursor.com/assets/images/open-in-web-dark.png"></picture></a>&nbsp;<a href="https://cursor.com/background-agent?bcId=bc-21db247f-bcb7-5165-a17e-fae39e201274&cursor_ref=pr_footer&cursor_cta=open_in_cursor"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cursor.com/assets/images/open-in-cursor-dark.png"><source media="(prefers-color-scheme: light)" srcset="https://cursor.com/assets/images/open-in-cursor-light.png"><img alt="Open in Cursor" width="131" height="28" src="https://cursor.com/assets/images/open-in-cursor-dark.png"></picture></a>&nbsp;</div>



## Locked UI matrix and attempt trail (2026-10-25)

U1: early attempts patched preview source while shared TREK still rendered text ratings. Later served-source work exposed grey fills/missing list stars, then a declaration-order Hotels crash. Current 04e5f55e claims gold fill/crash fixes; feature acceptance remains open. Pixel PASS alone does not accept U1.

U2 (#591 tab emoji), U3 (#560 timeline baselines), U4 (#550 phone name/description wrapping and visible prices), U5 (#590 list logos): not folded by this action; source PRs retained. #549 description substance stays DATA. No third keep PR. UI Gate B/Craig review requires a data-filled build.

Matrix: `bot-admin/messages/time-syncher/ui-acceptance-matrix`. Strategy: `bot-admin/messages/time-syncher/two-pr-strategy`. Current diagnosis: https://github.com/grampadsbot-sudo/timesyncher/pull/693#issuecomment-6401132048


## Locked two-PR consolidation tracking
Replacement ownership: Closes #672, Closes #582, Closes #691.
Craig 2026-10-25 13:18 PT explicitly orders sibling PR715-718 closed immediately, preserving substance in the two keep PRs. These are pending integration/closure obligations; no source folding, acceptance or deployment is claimed. #567 is process tracking only and adds no product coding scope.
Strategy: bot-admin/messages/time-syncher/two-pr-strategy.
