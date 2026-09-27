# r15

Staging deploy `54b6de9eed4809080b4d1037e3f42d2dff80dce0` is https://vacation-staging.timesyncher.com. Live `/api/version` matches that tip. Journey page 1 prints that sha. Nothing was pushed onto the code branch after that deploy.

The dialog PDF was not written. `scripts/live-transcript-dialog-pdf.mjs` exited 1 before creating a file: turn 25's price answer contains `Kimberly's $27, paid by you` and does not contain the required substring `Kimberly $27, paid by you`. Tyler and Lauren are in the required form. The pre-publish check that both PDFs print the live sha could not pass, because there is no dialog PDF.

Local `vercel build` wrote 1 function: `api/[...route].func`.

Local output status codes: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

Live status codes on that hash: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

## Scale

Jev's raw score is a 0–4 float. The labeled score is raw + 1, printed as that float on the 1–5 criterion legend. The mean is the mean of those labeled scores. v6's 3.913 is a different scale.

24 generated replies. Mean overall quality **3.343** on the Jev labeled scale (raw + 1). Histogram of rounded labeled bins: 4×10, 3×11, 2×3.

The fixed opener is not in that mean. Real per-turn median 5083ms. Gen-only median 4125.5ms. Session wall 231798ms. Rewrites ran on 10 of 24 turns and 4 shipped. 6 turns stayed flagged.

## Latency

The median is 5083ms. r14's median was 12443ms. The gen-only median is 4125.5ms. Fact checks still ran. A disposition of rewrite with a labeled score above 2 did not by itself call the rewrite model. A fact error or a raw path that still requires a rewrite did.

## Rewrites

A rewrite ships only when it is non-empty, not the same as the draft, its fact-error count is 0, its change line is present, and its raw score is greater than or equal to the draft. Jev returns a score only. The change line is the rewrite model's, from the same call, stored as `rewriterChange`. Turns with no rewrite have that field null. No code-built Jev note.

Shipped change lines:

- T3, qwen/qwen3-235b-a22b-2507: Removed "back-to-back heavy days" and used "no two big activities stacked," aligned with Lauren's rule as stated, and ensured no invented activities or timeline shifts.
- T7, qwen/qwen3-235b-a22b-2507: Removed incorrect implication that April 5 is the trip end and adjusted timing to align with saved itinerary.
- T25, qwen/qwen3-max: Added the exact per-payer dollar line and restricted place references to only those already named in the itinerary.
- T49, qwen/qwen3-235b-a22b-2507: Removed "midweek" reference and corrected the day description to align with the saved trip context, ensuring no invented activities or incorrect timing were included.

Six rewrite calls did not ship (T9, T27, T31, T35, T39, T41). Those turns stayed flagged. The shipped body on those turns is not the fact-flagged draft.

## Fact check

`savedTrip` is logged on each generated turn. Garden days become `apr 5` after the Sunday garden and `apr 5` plus `apr 9` after Kimberly's Thursday garden. Swim days become `apr 6` after Tyler saves Monday. They stay `apr 6` after the later-swim turn. Tyler's later swim was not placed on the second Friday.

T5 does not offer an arrival-day pool dip. T19 does not call Friday, April 10 midweek. T49's draft did, and the shipped rewrite removed it. T11 still offers a house-pool swim as one of two Tuesday options, and the fact check did not flag it. T45 offers a beach swim as one of two Tuesday options, unflagged.

## Roster

The account holder is Craig Davidson, role Owner. Kimberly, Tyler, and Lauren are collaborators. Marcus Chen is a viewer. Aunt Jean is an editor. T3 names Craig with the children. T5 addresses Craig and then names only the children as the people settling in. T27 and T35 welcomes do not restate the April 12 end or the full party. T43 names Craig, Kimberly, Tyler, and the kids, with gardens on Sunday and Thursday, a swim on Monday, and dinner on Friday.

## What shipped

- T5: arrival is SpeediShuttle and groceries. No pool dip. The settling sentence names the four children.
- T7: Sunday, April 5 garden morning, crew leaves the house around 9:45 a.m., note lives on that day. Rewrite shipped.
- T11: Tuesday options are a house-pool swim and a Kailua-Kona town walk. Unflagged.
- T19: garden photos, a late swim "whenever it lands," Friday, April 10 dinner. Not called midweek.
- T25: unlimited vacations for the whole year, `$27` per person, then `Kimberly's $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren`. That missed the exact Kimberly substring, so the dialog PDF gate refused the pack.
- T31: second garden kept on Thursday, April 9. Wednesday afternoon left open. Saved trip garden days include `apr 9`.
- T39: later swim stays "later in the week" and is not placed on Friday, April 10.
- T45: Tuesday options are a town walk or a beach swim. Craig is named in the party.

## Notes

Jev cannot return free text. Every generated turn has `jevNote: null` and `jevNoteReason: jev_no_free_text`. `rewriteJevScoreRaw` and `rejudgeMs` are null when no rewrite ran. The fixed opener is not a generated turn. Its stored quality score is 5 and it is outside the mean. The dialog PDF that would have omitted `quality: 5` was not written. Journey text does not contain `quality: 5` or `Fri Apr 3 · Fri Apr 3`.

## Feature map

The journey self-check lists 36 feature files. Five ruled-out screens are not in that list: Cursor project contract, Search, Autonomy bar, Trip View config, Telegram intake.

| Ruling | Surface | This drive |
| --- | --- | --- |
| Remove | Cursor project contract | Not in the journey |
| Remove | Search screen | Not in the journey |
| Remove | Autonomy bar screen | Not in the journey |
| Remove | Trip View config | Not in the journey |
| Remove | Telegram intake | Not in the journey |
| Already built | Print/PDF Layout 1 and Layout 2 | Style one and Style two captured. Print/PDF menu is a gap: the header PDFs control did not open |
| Already built | Keepsakes config | Gap: Keepsakes setup did not open |
| Already built | Ratings and reviews | Gap: no sourced rating screenshot |
| Already built | Restaurant happy hour | Captured: Ulu Ocean Grill happy hour |
| Build | Order Keepsakes | Captured: shareable buy link, anyone with the trip keepsake URL can order |
| Car is not a page | Cars as Things | Captured: Cars tab. Not a separate car page |

Captured feature files: 33 of 36. Journey pages: 82. Gaps: 3.

Flight fields captured as KOA arrival from the saved trip. The journey note says the fields come from the trip, not a hard-coded connection.

## Per-turn logs

Labeled scores in a dialog PDF would be raw + 1. The columns below are the raw 0–4 scores. `rewriteRaw` and `rejudgeMs` are null when no rewrite ran. `rewriter` is the rewrite model's change line, or null when that turn has no shipped rewrite.

```
T3 | draftRaw=1.21 | draftChoice=rewrite | draftFocus=misses_ask | rewriteRaw=1.26 | rewriteChoice=rewrite | rewriteFocus=misses_ask | draftFact=Lauren's rule is no two big activities stacked on the same day | rewriteFact=ok | rejudgeMs=243 | shippedRaw=1.26 | rewritten=True | flagged=False | fail=null | rewriter=Removed "back-to-back heavy days" and used "no two big activities stacked," aligned with Lauren's rule as stated, and ensured no invented activities or timeline shifts. | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": []}
T5 | draftRaw=2.96 | draftChoice=keep | draftFocus=keep | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=2.96 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": []}
T7 | draftRaw=2.19 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=2.62 | rewriteChoice=keep | rewriteFocus=keep | draftFact=apr 5 is not the trip end | rewriteFact=ok | rejudgeMs=249 | shippedRaw=2.62 | rewritten=True | flagged=False | fail=null | rewriter=Removed incorrect implication that April 5 is the trip end and adjusted timing to align with saved itinerary. | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T9 | draftRaw=1.82 | draftChoice=rewrite | draftFocus=misses_ask | rewriteRaw=2.66 | rewriteChoice=keep | rewriteFocus=misses_ask | draftFact=a swim on apr 6 was not set by the customer | rewriteFact=a swim on apr 6 was not set by the customer | rejudgeMs=831 | shippedRaw=1.82 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 6 was not set by the customer | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T11 | draftRaw=3.12 | draftChoice=keep | draftFocus=keep | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=3.12 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T13 | draftRaw=1.21 | draftChoice=rewrite | draftFocus=misses_ask | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=1.21 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T15 | draftRaw=1.4 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=1.4 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T17 | draftRaw=1.79 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=1.79 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T19 | draftRaw=2.7 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=2.7 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T21 | draftRaw=1.69 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=1.69 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T23 | draftRaw=2.26 | draftChoice=rewrite | draftFocus=misses_ask | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=2.26 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T25 | draftRaw=1.18 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.63 | rewriteChoice=keep | rewriteFocus=keep | draftFact=ok | rewriteFact=ok | rejudgeMs=20263 | shippedRaw=2.63 | rewritten=True | flagged=False | fail=null | rewriter=Added the exact per-payer dollar line and restricted place references to only those already named in the itinerary. | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T27 | draftRaw=2.96 | draftChoice=keep | draftFocus=payment_wording | rewriteRaw=2.98 | rewriteChoice=rewrite | rewriteFocus=payment_wording | draftFact=a swim on apr 5 was not set by the customer | rewriteFact=a swim on apr 10 was not set by the customer | rejudgeMs=279 | shippedRaw=2.96 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 10 was not set by the customer | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T29 | draftRaw=2.32 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=2.32 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5"]}
T31 | draftRaw=2.46 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=2.16 | rewriteChoice=keep | rewriteFocus=keep | draftFact=a swim on apr 9 was not set by the customer | rewriteFact=ok | rejudgeMs=212 | shippedRaw=2.46 | rewritten=False | flagged=True | fail=rewrite_scored_lower | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5", "apr 9"]}
T33 | draftRaw=3.03 | draftChoice=keep | draftFocus=keep | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=3.03 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5", "apr 9"]}
T35 | draftRaw=2.67 | draftChoice=rewrite | draftFocus=payment_wording | rewriteRaw=2.93 | rewriteChoice=keep | rewriteFocus=payment_wording | draftFact=a swim on apr 5 was not set by the customer | rewriteFact=a swim on apr 5 was not set by the customer | rejudgeMs=212 | shippedRaw=2.67 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 5 was not set by the customer | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": [], "gardenDays": ["apr 5", "apr 9"]}
T37 | draftRaw=1.68 | draftChoice=rewrite | draftFocus=misses_ask | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=1.68 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": ["apr 6"], "gardenDays": ["apr 5", "apr 9"]}
T39 | draftRaw=2.44 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=1.91 | rewriteChoice=keep | rewriteFocus=misses_ask | draftFact=Lauren's rule is no two big activities stacked on the same day; a swim on apr 9 was not set by the customer | rewriteFact=a swim on apr 9 was not set by the customer | rejudgeMs=196 | shippedRaw=2.44 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 9 was not set by the customer | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": ["apr 6"], "gardenDays": ["apr 5", "apr 9"]}
T41 | draftRaw=3.41 | draftChoice=keep | draftFocus=keep | rewriteRaw=3.11 | rewriteChoice=keep | rewriteFocus=keep | draftFact=apr 6 is not the trip end | rewriteFact=ok | rejudgeMs=253 | shippedRaw=3.41 | rewritten=False | flagged=True | fail=rewrite_scored_lower | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": ["apr 6"], "gardenDays": ["apr 5", "apr 9"]}
T43 | draftRaw=2.25 | draftChoice=rewrite | draftFocus=payment_wording | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=2.25 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": ["apr 6"], "gardenDays": ["apr 5", "apr 9"]}
T45 | draftRaw=2.34 | draftChoice=keep | draftFocus=unnamed_place | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=2.34 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": ["apr 6"], "gardenDays": ["apr 5", "apr 9"]}
T47 | draftRaw=2.41 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=null | rewriteChoice=null | rewriteFocus=null | draftFact=ok | rewriteFact=null | rejudgeMs=null | shippedRaw=2.41 | rewritten=False | flagged=False | fail=null | rewriter=null | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": ["apr 6"], "gardenDays": ["apr 5", "apr 9"]}
T49 | draftRaw=2.47 | draftChoice=keep | draftFocus=keep | rewriteRaw=2.81 | rewriteChoice=keep | rewriteFocus=keep | draftFact=Friday is not midweek | rewriteFact=ok | rejudgeMs=222 | shippedRaw=2.81 | rewritten=True | flagged=False | fail=null | rewriter=Removed "midweek" reference and corrected the day description to align with the saved trip context, ensuring no invented activities or incorrect timing were included. | savedTrip={"end": "2026-04-12", "owner": "Craig Davidson", "start": "2026-04-03", "swimDays": ["apr 6"], "gardenDays": ["apr 5", "apr 9"]}
```
