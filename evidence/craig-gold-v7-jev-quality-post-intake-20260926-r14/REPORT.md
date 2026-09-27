# r14

Staging deploy `b0f8802b998b42e83bd285b16707045b896e300b` is https://vacation-staging.timesyncher.com. Live `/api/version` matches that tip. Journey page 1 prints that sha. Nothing was pushed onto the code branch after that deploy.

Local `vercel build` wrote 1 function: `api/[...route].func`.

Local output status codes: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

Live status codes on that hash: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

## Scale

Jev's raw score is a 0–4 float. The labeled score is raw + 1, printed as that float on the 1–5 criterion legend. The mean is the mean of those labeled scores. v6's 3.913 is a different scale.

24 generated replies. Mean overall quality **3.343** on the Jev labeled scale (raw + 1). Histogram of rounded labeled bins: 4×9, 3×12, 2×3.

The fixed opener is not in that mean. Real per-turn median 12443ms. Gen-only median 3949ms. Session wall 288572ms. Rewrites ran on 19 of 24 turns and 0 shipped. 18 turns stayed flagged.

## Latency

The median is 12443ms because a rewrite still ran on 19 of 24 generated turns. The gen-only median is 3949ms. Checks were not skipped. A fact error or a Jev disposition of rewrite still calls the rewrite model.

## Rewrites

A rewrite ships only when it is non-empty, not the same as the draft, its fact-error count is 0, and its raw score is greater than or equal to the draft. A tie on fact errors does not ship. A rewrite scored below its draft does not ship. If the held draft is fact-clean and the rewrite was refused for a lower score or for being the same text, the turn stays unflagged. If the draft or the refused rewrite still has a fact error, the turn is flagged.

This drive shipped 0 rewrites. 18 turns stayed flagged.

## Fact check

The check reads the saved trip: April 3–12, the swims and gardens the customer set, and the roles. It does not take the trip end from the last date mentioned in the chat. A denied swim or garden ("isn't set", "won't lock", "not already set") is not a committed day. Code does not delete or edit sentences. `rawModelText` is the model text. `rewriteJevScoreRaw` is null when no rewrite ran. `rejudgeMs` is the rewrite Jev call, and null when no rewrite ran.

## What shipped

- T3 names Friday, April 3rd to Sunday, April 12th, 2026, and restates Lauren's rule as not stacking two big activities. It is flagged because Tyler's later swim was read onto April 3.
- T11 still offers a Tuesday, April 7 beach swim as one of two options. The fact check caught it and the turn is flagged.
- T7 says "head out mid-morning" for the garden visit. That is flagged.
- T15 does not call Thursday the last day. Marcus Chen and Aunt Jean are offered view access or edit access. A house-pool line on that day was flagged as a swim.
- T25 states unlimited vacations for the whole year and Kimberly $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren. It says April 3–12. It is flagged because the arrival sentence was also read as a swim and a garden.
- T27, T35, and T43 welcome Kimberly, Tyler, and Lauren without saying April 3rd to the 9th or the 6th. They name April 3 and the saved days. They do not restate April 12 as the end.
- T45 offers a town walk or a dinner on Tuesday, not a Tuesday swim. It is flagged because Monday's swim is named in that Tuesday sentence.

## Roster

The JSONL session header records where each roster field came from. 13 source rows are on the party. Viewers and editors are not listed as traveling.

## Flight and keepsakes

Flight fields are captured from the saved trip start. Keepsake Style one is captured on vacation-staging. Ratings and reviews is a gap: no sourced rating screenshot was captured.

## Notes

Jev cannot return free text. Every generated turn has `jevNote: null` and `jevNoteReason: jev_no_free_text`. No code-built note and no note from another model.

## Gaps left for Craig

Cursor project contract, search redesign, autonomy bar, car fields, print and PDF, keepsakes config, order keepsakes, trip view config, and Telegram intake. Ratings and reviews is the extra honest gap.

## Per-turn logs

Labeled scores in the dialog PDF are raw + 1. The columns below are the raw 0–4 scores. `rewriteRaw` is none when no rewrite ran. `rejudgeMs` is none in that same case. `shippedRaw` is the raw score of the text that shipped.

```
T3 | draftRaw=2.06 | draftChoice=rewrite | draftFocus=misses_ask | rewriteRaw=1.85 | rewriteChoice=rewrite | rewriteFocus=misses_ask | draftFact=a swim on apr 3 was not set by the customer | rewriteFact=a swim on apr 3 was not set by the customer | rejudgeMs=239 | shippedRaw=2.06 | rewritten=False | flagged=True | fail=rewrite_near_draft
T5 | draftRaw=2.03 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=1.74 | rewriteChoice=rewrite | rewriteFocus=keep | draftFact=ok | rewriteFact=Lauren's rule is no two big activities stacked on the same day | rejudgeMs=233 | shippedRaw=2.03 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: Lauren's rule is no two big activities stacked on the same day
T7 | draftRaw=1.49 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=1.62 | rewriteChoice=keep | rewriteFocus=keep | draftFact=apr 5 is not the trip end; a swim on apr 5 was not set by the customer | rewriteFact=apr 5 is not the trip end | rejudgeMs=257 | shippedRaw=1.49 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: apr 5 is not the trip end
T9 | draftRaw=2.03 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.4 | rewriteChoice=rewrite | rewriteFocus=misses_ask | draftFact=a swim on apr 6 was not set by the customer | rewriteFact=a swim on apr 6 was not set by the customer | rejudgeMs=215 | shippedRaw=2.03 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 6 was not set by the customer
T11 | draftRaw=2.31 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=1.36 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=a swim on apr 7 was not set by the customer | rewriteFact=a swim on apr 7 was not set by the customer | rejudgeMs=222 | shippedRaw=2.31 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 7 was not set by the customer
T13 | draftRaw=2.19 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=1.73 | rewriteChoice=keep | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | rejudgeMs=233 | shippedRaw=2.19 | rewritten=False | flagged=False | fail=rewrite_scored_lower
T15 | draftRaw=1.33 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=1.68 | rewriteChoice=rewrite | rewriteFocus=keep | draftFact=a garden on apr 9 was not set by the customer; a swim on apr 9 was not set by the customer | rewriteFact=a garden on apr 9 was not set by the customer | rejudgeMs=349 | shippedRaw=1.33 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a garden on apr 9 was not set by the customer
T17 | draftRaw=2.57 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | rejudgeMs=none | shippedRaw=2.57 | rewritten=False | flagged=False | fail=none
T19 | draftRaw=1.93 | draftChoice=rewrite | draftFocus=misses_ask | rewriteRaw=2.31 | rewriteChoice=rewrite | rewriteFocus=misses_ask | draftFact=a swim on apr 6 was not set by the customer | rewriteFact=a swim on apr 6 was not set by the customer | rejudgeMs=258 | shippedRaw=1.93 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 6 was not set by the customer
T21 | draftRaw=3.25 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | rejudgeMs=none | shippedRaw=3.25 | rewritten=False | flagged=False | fail=none
T23 | draftRaw=3.17 | draftChoice=keep | draftFocus=keep | rewriteRaw=3.06 | rewriteChoice=keep | rewriteFocus=keep | draftFact=a swim on apr 5 was not set by the customer | rewriteFact=a swim on apr 3 was not set by the customer | rejudgeMs=235 | shippedRaw=3.17 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 3 was not set by the customer
T25 | draftRaw=2.96 | draftChoice=keep | draftFocus=keep | rewriteRaw=2.74 | rewriteChoice=rewrite | rewriteFocus=keep | draftFact=a swim on apr 3 was not set by the customer; a garden on apr 3 was not set by the customer | rewriteFact=a swim on apr 3 was not set by the customer; a garden on apr 3 was not set by the customer | rejudgeMs=196 | shippedRaw=2.96 | rewritten=False | flagged=True | fail=rewrite_near_draft
T27 | draftRaw=2.91 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=2.89 | rewriteChoice=keep | rewriteFocus=payment_wording | draftFact=a swim on apr 3 was not set by the customer | rewriteFact=a swim on apr 5 was not set by the customer | rejudgeMs=216 | shippedRaw=2.91 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 5 was not set by the customer
T29 | draftRaw=2.62 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | rejudgeMs=none | shippedRaw=2.62 | rewritten=False | flagged=False | fail=none
T31 | draftRaw=2.14 | draftChoice=keep | draftFocus=unnamed_place | rewriteRaw=0.29 | rewriteChoice=rewrite | rewriteFocus=misses_ask | draftFact=a garden on apr 9 was not set by the customer | rewriteFact=a swim on apr 9 was not set by the customer; a garden on apr 9 was not set by the customer | rejudgeMs=199 | shippedRaw=2.14 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 9 was not set by the customer; a garden on apr 9 was not set by the customer
T33 | draftRaw=1.49 | draftChoice=rewrite | draftFocus=misses_ask | rewriteRaw=2.18 | rewriteChoice=keep | rewriteFocus=misses_ask | draftFact=ok | rewriteFact=a garden on apr 9 was not set by the customer | rejudgeMs=239 | shippedRaw=1.49 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a garden on apr 9 was not set by the customer
T35 | draftRaw=2.91 | draftChoice=rewrite | draftFocus=payment_wording | rewriteRaw=3.13 | rewriteChoice=rewrite | rewriteFocus=payment_wording | draftFact=a swim on apr 3 was not set by the customer | rewriteFact=a swim on apr 5 was not set by the customer | rejudgeMs=255 | shippedRaw=2.91 | rewritten=False | flagged=True | fail=rewrite_near_draft
T37 | draftRaw=2.29 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=1.66 | rewriteChoice=rewrite | rewriteFocus=misses_ask | draftFact=a garden on apr 10 was not set by the customer | rewriteFact=ok | rejudgeMs=201 | shippedRaw=2.29 | rewritten=False | flagged=True | fail=rewrite_scored_lower
T39 | draftRaw=2.57 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.89 | rewriteChoice=keep | rewriteFocus=keep | draftFact=a garden on apr 9 was not set by the customer | rewriteFact=a swim on apr 5 was not set by the customer; a swim on apr 10 was not set by the customer | rejudgeMs=215 | shippedRaw=2.57 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 5 was not set by the customer; a swim on apr 10 was not set by the customer
T41 | draftRaw=2.13 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=2.66 | rewriteChoice=keep | rewriteFocus=keep | draftFact=ok | rewriteFact=Lauren's rule is no two big activities stacked on the same day; the garden on apr 3 is not already set | rejudgeMs=207 | shippedRaw=2.13 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: Lauren's rule is no two big activities stacked on the same day; the garden on apr 3 is not already set
T43 | draftRaw=2.49 | draftChoice=keep | draftFocus=payment_wording | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | rejudgeMs=none | shippedRaw=2.49 | rewritten=False | flagged=False | fail=none
T45 | draftRaw=2.26 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.14 | rewriteChoice=rewrite | rewriteFocus=misses_ask | draftFact=a swim on apr 7 was not set by the customer | rewriteFact=a swim on apr 5 was not set by the customer | rejudgeMs=219 | shippedRaw=2.26 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: a swim on apr 5 was not set by the customer
T47 | draftRaw=2.33 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.51 | rewriteChoice=rewrite | rewriteFocus=keep | draftFact=a garden on apr 9 was not set by the customer | rewriteFact=Lauren's rule is no two big activities stacked on the same day | rejudgeMs=205 | shippedRaw=2.33 | rewritten=False | flagged=True | fail=rewrite_fact_check_held: Lauren's rule is no two big activities stacked on the same day
T49 | draftRaw=2.78 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | rejudgeMs=none | shippedRaw=2.78 | rewritten=False | flagged=False | fail=none
```

Hold certify. No merge.
