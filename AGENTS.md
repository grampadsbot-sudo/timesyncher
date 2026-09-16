# TimeSyncher Vacation — agent contract

Canonical Cursor Project / repo agent rules for this repository. Cloud agents inherit these from disk, not chat memory.

SoT: `bot-admin/messages/time-syncher/cursor-project-style-two-contract-20260916`

Hold certify. Thin routes Cursor. CoS talk front. Do not kick SCT/QA unless Thin explicitly orders it.

## FIVE HARD RULES (verbatim)

1. One Style-one + one Style-two renderer only — patch those existing product files; any new parallel export/print/PDF template path = FAIL.
2. Keepsakes→Config is law — maps/sections print only when Config ON; OFF ⇒ omit; ignoring Config = FAIL.
3. Golden bars re-PASS together after every change: centered Style-two itinerary; Style-one left when Style one; two-col Saved Stories + media; summary-before-story; end-of-book all-things continuous lists (no orphan category page-break); top margin; two-col logo+summary; Config maps; live HH when in set. Next candidate delivers BOTH Style one AND Style two.
4. No Cursor self-proof — Keepsake QA live+PDF only.
5. Load GBrain first — SoT pages + get_page skills/keepsake-qa/skill (+ pstack, timesyncher-vacation-verification). Feature Map entry required for any UI claim.

## GBrain SoTs to load first

- `bot-admin/messages/time-syncher/repeatable-style-two-no-regress-20260915`
- `bot-admin/messages/time-syncher/style-one-two-use-existing-renderer-20260910`
- `bot-admin/messages/time-syncher/style-2-craig-config-maps-both-styles-20260916`
- `bot-admin/messages/time-syncher/cursor-pstack-compliance-20260916`
- `bot-admin/messages/time-syncher/style-2-qa-fail-55ca70b-20260916`
- `bot-admin/messages/time-syncher/style-2-craig-fail-55ca70b-margin-maps-allthings-20260916`
- `bot-admin/messages/time-syncher/style-2-craig-fail-55ca70b-no-category-pagebreak-20260916`
- `bot-admin/messages/time-syncher/style-2-craig-fail-bed0620-20260916`
- `skills/keepsake-qa/skill`

Feature Map (behavior inventory SoT): `features/README.md`. A UI claim without a Feature Map entry is incomplete.

## Existing product renderers (only)

| Layout | Product function | Staging print path |
| --- | --- | --- |
| Style one | TREK `Ae()` days via `op()` (left itinerary) + Config `so()` maps | `/shared/{token}/journey?style=1&printMode=report&pdfReport=keepsake` |
| Style two | TREK `Ae(true)` days via `Mc()` (centered) + Config `so()`/`xa()` maps | `/shared/{token}/journey?style=2&printMode=report&pdfReport=keepsake-style-2` |

Patch `src/vacation/trek-style2-bundle.mjs`. Do not invent a third HTML/PDF book. Quarantined non-export: `src/vacation/keepsake-style2.mjs` `renderStyle2Html`.

## Verification lever before layout churn

1. Load `pstack` and `timesyncher-vacation-verification`.
2. Run `npm run test:keepsake-style2` (and related vacation tests touched by the change).
3. File GBrain receipts. Cursor cloud output is not authority until filed and Keepsake QA live+PDF decides.

Always-applied Cursor rule: `.cursor/rules/style-two-keepsake-contract.mdc`
