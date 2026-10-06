# TimeSyncher Vacation — agent contract

Canonical Cursor Project / repo agent rules for this repository. Cloud agents inherit these from disk, not chat memory.

SoT: `bot-admin/messages/time-syncher/cursor-project-style-two-contract-20260916`

Hold certify. Thin routes Cursor. CoS talk front. Do not kick SCT/QA unless Thin explicitly orders it.

## Lean mode (Craig 2026-10-05 9:24 PM PT; binding)

- One `composer-2.5` cloud agent per routine change. No extra agents, sub-agents or parallel reviewers.
- One screenshot check per change, against Craig's approved baseline (`baselines/manifest.json`), at 390 and 1280 for the screens and states the change touches. One round per change; the baseline is the before.
- pstack is opt-in. Don't load or run pstack (interrogate, blast-radius, any pstack reviewer) unless your task says `Hard fix cleared by dr eggbot: <PT time>`. When it runs, reviewers use Cursor models only per `.cursor/rules/pstack-models.mdc` (every role `inherit-parent`; never claude-opus*, gpt-* or another non-Cursor model).
- CI failed? Don't rerun, restart or re-trigger it and don't push guess fixes. Report the failing check (run id, job, first error) and wait for one targeted fix.
- Steers you get are short and scoped. Do the one change asked, then report.
- Full process: GBrain `skills/tsv-engineer-pr-process/skill`.

## PERMANENT INVARIANT — Saved-story Thing media (in product print code)

SoTs: `bot-admin/messages/time-syncher/saved-story-media-in-print-code-20260916`, `bot-admin/messages/time-syncher/saved-story-flag-on-thing-20260916`

Saved Story is a **flag on the Thing** (no separate Story entity). Style one `Ae()` / `fs()` and Style two `Ae(true)` print code MUST always embed that Thing’s bound media (`places[].bound_media`, `fo()`, `/ts-thing-media`) as **actual image bytes** (`printDataUrl` / `data:image/jpeg`) in `src/vacation/trek-style2-bundle.mjs` (`fo()` bound_media-only when present, `Kl()`/`Ba()` printDataUrl-first, `So()` data: pass-through, `_se()` drops 1024²@3071B TREK stubs). Cursor chat/project memory is not a substitute. Placeholders while those URLs 200 = FAIL.

## FIVE HARD RULES (verbatim)

1. One Style-one + one Style-two renderer only — patch those existing product files; any new parallel export/print/PDF template path = FAIL.
2. Keepsakes→Config is law — maps/sections print only when Config ON; OFF ⇒ omit; ignoring Config = FAIL.
3. Golden bars re-PASS together after every change: centered Style-two itinerary; Style-one left when Style one; two-col Saved Stories + media; summary-before-story; end-of-book all-things continuous lists (no orphan category page-break); top margin; two-col logo+summary; Config maps; live HH when in set. Next candidate delivers BOTH Style one AND Style two.
4. No Cursor self-proof — Keepsake QA live+PDF only.
5. Load GBrain first — SoT pages + get_page skills/keepsake-qa/skill and skills/timesyncher-vacation-verification/skill. Load pstack only for a hard fix dr eggbot cleared (lean mode). Feature Map entry required for any UI claim.

## GBrain SoTs to load first

- `bot-admin/messages/time-syncher/repeatable-style-two-no-regress-20260915`
- `bot-admin/messages/time-syncher/style-one-two-use-existing-renderer-20260910`
- `bot-admin/messages/time-syncher/style-2-craig-config-maps-both-styles-20260916`
- `bot-admin/messages/time-syncher/cursor-pstack-compliance-20260916`
- `bot-admin/messages/time-syncher/style-2-qa-fail-55ca70b-20260916`
- `bot-admin/messages/time-syncher/style-2-craig-fail-55ca70b-margin-maps-allthings-20260916`
- `bot-admin/messages/time-syncher/style-2-craig-fail-55ca70b-no-category-pagebreak-20260916`
- `bot-admin/messages/time-syncher/style-2-craig-fail-bed0620-20260916`
- `bot-admin/messages/time-syncher/style-2-qa-fail-b396b63-20260916`
- `bot-admin/messages/time-syncher/saved-story-flag-on-thing-20260916`
- `bot-admin/messages/time-syncher/saved-story-media-in-print-code-20260916`
- `skills/keepsake-qa/skill`
- `skills/tsv-engineer-pr-process/skill`

Feature Map (behavior inventory SoT): `features/README.md`. A UI claim without a Feature Map entry is incomplete.

## Existing product renderers (only)

| Layout | Product function | Staging print path |
| --- | --- | --- |
| Style one | TREK `Ae()` days via `op()` (left itinerary) + Config `so()` maps | `/shared/{token}/journey?style=1&printMode=report&pdfReport=keepsake` |
| Style two | TREK `Ae(true)` days via `Mc()` (centered) + Config `so()`/`xa()` maps | `/shared/{token}/journey?style=2&printMode=report&pdfReport=keepsake-style-2` |

Patch `src/vacation/trek-style2-bundle.mjs`. Do not invent a third HTML/PDF book. Quarantined non-export: `src/vacation/keepsake-style2.mjs` `renderStyle2Html`.

## Verification lever before layout churn

1. Load `timesyncher-vacation-verification` and the approved baseline for the screens you touch. Load `pstack` only for a hard fix dr eggbot cleared (lean mode).
2. Run `npm run test:keepsake-style2` (and related vacation tests touched by the change).
3. File GBrain receipts. Cursor cloud output is not authority until filed and Keepsake QA live+PDF decides.

Always-applied Cursor rule: `.cursor/rules/style-two-keepsake-contract.mdc`
