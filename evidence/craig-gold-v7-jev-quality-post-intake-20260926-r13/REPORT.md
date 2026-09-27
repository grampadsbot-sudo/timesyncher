# r13

Staging deploy `63271c291d2bb98f690d587e963e6839d103793d` is https://vacation-staging.timesyncher.com. Live `/api/version` matches that tip. One deploy. Nothing was pushed onto the code branch after it.

Local `vercel build` wrote 1 function: `api/[...route].func`.

Local output status codes: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

Live status codes on that hash: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

## Scale

Jev's raw score is a 0–4 float. The labeled score is raw + 1, printed as that float on the 1–5 criterion legend. The mean is the mean of those labeled scores. v6's 3.913 is a different scale.

24 generated replies. Mean overall quality **3.431** on the Jev labeled scale (raw + 1). Histogram of rounded labeled bins: 5×0, 4×11, 3×13, 2×0, 1×0.

The fixed opener is not in that mean. Real per-turn median 8479ms. Gen-only median 3817ms. Session wall 221179ms. Fourteen rewrites shipped. Two turns stayed flagged.

## One trip

The purchase email, the email click, the three collaborator invites, and the itinerary are the same intake slug. The purchase email shows a visible https link. VERIFY has no different-trip gap. Kimberly, Tyler, and Lauren each have a welcome screenshot. The welcome lines in the chat are "Welcome aboard, Kimberly.", "Welcome aboard, Tyler.", and "Welcome aboard, Lauren."

## Rewrites

On the prior tip, a rewrite shipped only when its score was higher than the draft. Fifteen of the twenty-one rewrites Jev asked for were dropped as `rewrite_not_higher`. T39's rewrite was empty at 7003 ms because the rewrite timeout was 7000 ms.

The adequate-rewrite steer is gone. A disposition of rewrite is honored at any labeled score. The ship rule no longer requires a higher score. A rewrite ships when it is non-empty, not the same as the draft, and its fact-error count is not higher than the draft's. The rewrite timeout is 20000 ms, with one retry when the rewrite text is empty, and one more model call when the first rewrite still has fact errors and the second has fewer. Code does not insert fallback text.

This drive shipped 14 rewrites, including rewrites whose raw score is lower than the draft. Two stayed flagged: T3 `rewrite_near_draft`, and T39 `rewrite_fact_check_worse` (the rewrite added a swim on April 9). T39 returned a scored rewrite, so the empty-timeout failure did not recur.

## Fact check

`neutralizeFalseClaim` and `dropAccuracySentences` are gone. Code does not insert or replace reply text. Each draft is checked against the days, swims, gardens, owners, and purchases in the customer turns so far. The check result is logged on the turn. A failing draft is sent to a model rewrite. If that rewrite has more fact errors, the draft ships and the turn is flagged. If the counts are equal, the rewrite ships even when both still contain the error.

What the log shows:

- T3 does not name a Thursday garden or a Friday swim. The draft shipped because the rewrite was nearly the same text. Fact check: ok.
- T11 offers a morning swim on Tuesday, April 7. Fact check logged ok on the draft and the rewrite, and the rewrite shipped. The offered Tuesday swim was not caught.
- T15 asks for Kimberly's second garden or a town walk and does not say the garden is already set. It does call Thursday, April 9 the last day in the house. Fact check logged ok. The trip the customer named ends Sunday, April 12, and the checker did not flag that last-day line.
- T25 says "You're all set for the Big Island week from Fri Apr 3 to Fri Apr 10, 2026" and names the plan "unlimited vacations for the whole year" with Kimberly $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren. It does not say "You're all set with the unlimited plan." Fact check logged ok. The shortened April 10 end was not caught: the checker looks for the word "april", and the trip end it uses is the last dated mention in reading order.
- T35's draft said the gardens were Tyler's. Fact check caught that. The rewrite logged ok and shipped.
- T39's rewrite added a swim on April 9. Fact check caught it, the rewrite was not shipped, and the turn is flagged.
- T43's draft had a swim on April 5 that the customer had not set. Fact check caught it. The rewrite logged ok and shipped.
- T45 still offers a house-pool swim on Tuesday, April 7, "one last time before packing up." Fact check caught the April 7 swim on both the draft and the rewrite, and did not separately flag "one last time." The error counts were equal, so the rewrite shipped with that Tuesday swim still in it.

## Roster

The JSONL session header records the party parsed from the customer lines: Torren 8, Peyton 6, Keegan 4, Fallon 2; Kimberly paid by the owner, Tyler paid by Tyler, Lauren paid by Lauren; viewer Marcus Chen; editor Aunt Jean. Ages and payers are not filled in from a hard-coded table.

## Flight fields

Connections and layover are not hard-coded. They were not stated, so the flight page leaves them empty and VERIFY records that as a gap.

## Notes

Jev cannot return free text. Every generated turn has `jevNote: null` and `jevNoteReason: jev_no_free_text`. No code-built note and no note from another model.

## Layout

The dialog PDF `jevRan` lines start at the left of the layout text. There is no leading space on `jevRan:`.

## Gaps left for Craig

Cursor project contract, search redesign, autonomy bar, car fields, print and PDF, keepsakes config, order keepsakes, trip view config, and Telegram intake. The flight connections and layover gap above is a separate honest gap. Keepsake Style one is also a gap: style=1 did not stay on vacation-staging.

## Per-turn logs

Labeled scores in the dialog PDF are raw + 1. The columns below are the raw 0–4 scores. A turn that did not call a rewrite stores rewrite raw as 0 and leaves disposition empty; those cells say none. `shippedRaw` is the raw score of the text that shipped.

```
T3 | draftRaw=1.65 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=0.96 | rewriteChoice=rewrite | rewriteFocus=misses_ask | draftFact=ok | rewriteFact=ok | shippedRaw=1.65 | rewritten=false | flagged=true | fail=rewrite_near_draft
T5 | draftRaw=1.94 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=2.15 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | shippedRaw=2.15 | rewritten=true | flagged=false | fail=none
T7 | draftRaw=2.11 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=2.2 | rewriteChoice=rewrite | rewriteFocus=keep | draftFact=ok | rewriteFact=ok | shippedRaw=2.2 | rewritten=true | flagged=false | fail=none
T9 | draftRaw=2.95 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | shippedRaw=2.95 | rewritten=false | flagged=false | fail=none
T11 | draftRaw=2.72 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.83 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | shippedRaw=2.83 | rewritten=true | flagged=false | fail=none
T13 | draftRaw=1.91 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=1.74 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | shippedRaw=1.74 | rewritten=true | flagged=false | fail=none
T15 | draftRaw=1.79 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=1.86 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | shippedRaw=1.86 | rewritten=true | flagged=false | fail=none
T17 | draftRaw=2.31 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=1.67 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | shippedRaw=1.67 | rewritten=true | flagged=false | fail=none
T19 | draftRaw=3.32 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | shippedRaw=3.32 | rewritten=false | flagged=false | fail=none
T21 | draftRaw=2.84 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | shippedRaw=2.84 | rewritten=false | flagged=false | fail=none
T23 | draftRaw=2.79 | draftChoice=keep | draftFocus=unnamed_place | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | shippedRaw=2.79 | rewritten=false | flagged=false | fail=none
T25 | draftRaw=2.52 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=3.45 | rewriteChoice=keep | rewriteFocus=keep | draftFact=ok | rewriteFact=ok | shippedRaw=3.45 | rewritten=true | flagged=false | fail=none
T27 | draftRaw=2.59 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=1.96 | rewriteChoice=rewrite | rewriteFocus=payment_wording | draftFact=ok | rewriteFact=ok | shippedRaw=1.96 | rewritten=true | flagged=false | fail=none
T29 | draftRaw=2.92 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | shippedRaw=2.92 | rewritten=false | flagged=false | fail=none
T31 | draftRaw=2.63 | draftChoice=keep | draftFocus=unnamed_place | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | shippedRaw=2.63 | rewritten=false | flagged=false | fail=none
T33 | draftRaw=2.11 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.39 | rewriteChoice=keep | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | shippedRaw=2.39 | rewritten=true | flagged=false | fail=none
T35 | draftRaw=2.29 | draftChoice=rewrite | draftFocus=payment_wording | rewriteRaw=2.26 | rewriteChoice=rewrite | rewriteFocus=keep | draftFact=the gardens are Kimberly's, not Tyler's | rewriteFact=ok | shippedRaw=2.26 | rewritten=true | flagged=false | fail=none
T37 | draftRaw=2.08 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.03 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | shippedRaw=2.03 | rewritten=true | flagged=false | fail=none
T39 | draftRaw=1.67 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=1.45 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=a swim on apr 9 was not set by the customer | shippedRaw=1.67 | rewritten=false | flagged=true | fail=rewrite_fact_check_worse: a swim on apr 9 was not set by the customer
T41 | draftRaw=2.97 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | shippedRaw=2.97 | rewritten=false | flagged=false | fail=none
T43 | draftRaw=2.63 | draftChoice=rewrite | draftFocus=keep | rewriteRaw=1.91 | rewriteChoice=rewrite | rewriteFocus=payment_wording | draftFact=a swim on apr 5 was not set by the customer | rewriteFact=ok | shippedRaw=1.91 | rewritten=true | flagged=false | fail=none
T45 | draftRaw=2.58 | draftChoice=keep | draftFocus=keep | rewriteRaw=2.46 | rewriteChoice=keep | rewriteFocus=keep | draftFact=a swim on apr 7 was not set by the customer | rewriteFact=a swim on apr 7 was not set by the customer | shippedRaw=2.46 | rewritten=true | flagged=false | fail=none
T47 | draftRaw=2.23 | draftChoice=rewrite | draftFocus=unnamed_place | rewriteRaw=2.7 | rewriteChoice=rewrite | rewriteFocus=unnamed_place | draftFact=ok | rewriteFact=ok | shippedRaw=2.7 | rewritten=true | flagged=false | fail=none
T49 | draftRaw=3 | draftChoice=keep | draftFocus=keep | rewriteRaw=none | rewriteChoice=none | rewriteFocus=none | draftFact=ok | rewriteFact=none | shippedRaw=3 | rewritten=false | flagged=false | fail=none
```

Hold certify. No merge.
