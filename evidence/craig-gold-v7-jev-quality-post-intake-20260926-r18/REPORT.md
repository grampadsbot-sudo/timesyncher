# r18 Big Island Family v7 — hold certify

Graded tip `e830a5d177fcb5091cf127129ca9ea9481c4b5e2`.

Commit time: 2026-09-27 20:21:47 UTC (10:21:47 HST).

Drive start: 2026-09-27T20:23:11.762Z (10:23:11 HST).

Drive end: 2026-09-27T20:26:02.198Z (10:26:02 HST).

That tip was deployed to https://vacation-staging.timesyncher.com before the drive. Live `/api/version` matched it at drive start and at drive end. The sha stored on the turns is that tip. Both PDFs print `live e830a5d177fcb5091cf127129ca9ea9481c4b5e2 https://vacation-staging.timesyncher.com`. The journey build printed `both PDFs match live e830a5d177fcb5091cf127129ca9ea9481c4b5e2`. Render did not overwrite `buildSha`.

This evidence commit is the only commit of this drive. No merge. The Vercel `workspace` project was left alone.

Local `vercel build` of this tip wrote 1 function: `.vercel/output/functions/api/[...route].func`.

Local curls against this tip: `GET /` 200, `GET /api/version` 200 and the body sha is the tip, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400 (`session is required.`).

## Scale

24 generated replies. The opener is outside the mean. Mean of the shipped labeled scores is **3.175**. Rounded bins: 5×1, 4×9, 3×8, 2×6.

Session wall 167475 ms. Real per-turn median 5558 ms. Gen-only median 3993.5 ms.

Models on the generated turns stay on the allowlist: T1 `google/gemini-2.5-flash-lite`, T2 `qwen/qwen3-235b-a22b-2507`, T3 `deepseek/deepseek-v3.2`, T4 `qwen/qwen3-max`. Jev is `typesafe/jev-1.13`. Jev notes are null (`jevNoteReason: jev_no_free_text`). Code did not write reply sentences.

Ten rewrite drafts. Three shipped (T11, T27, T45). Seven were held. A rewrite that cannot ship does not get a second score. T11 shipped with no change line. T27 and T45 shipped with a change line that matches the diff.

## Owner and party

The stored party owner is Craig Davidson. Collaborators are Kimberly Davidson, Tyler Davidson, and Lauren Davidson. Kids are Torren, Peyton, Keegan, and Fallon. Marcus Chen is a viewer. Aunt Jean is an editor. The shipped turns do not call Kimberly, Tyler, or Lauren the account holder, and they do not say party of eight.

T15 held its rewrite because it put Marcus Chen and Aunt Jean on the trip. The shipped T15 text is the draft.

T27's shipped rewrite adds Tyler and Lauren. The change line is "Added Tyler and Lauren to the list of traveling companions." The draft did not name them. The shipped text does.

T45's change line is "Removed the implication that both options were already saved and clarified that the day is open per the actual itinerary." Tyler remains in the shipped text.

## Fact check

A swim called saved on the second Friday is a fact miss unless that day is already saved, or the customer has just asked for the later swim. T3 and T9 do not ship that false save. T15's rewrite was held for putting the viewer and the editor on the trip. T25's rewrite was held because it dated a town walk on April 10.

Held lines in the dialog PDF, with no change line:

- T3 `quality: 1.9 · rewrite drafted, held: rewrite_scored_lower`
- T7 `quality: 3.04 · rewrite drafted, held: rewrite_scored_lower`
- T9 `quality: 2.06 · rewrite drafted, held: rewrite_scored_lower`
- T15 `quality: 2.49 · rewrite drafted, held: rewrite_fact_check_held: Marcus Chen is a viewer, not on the trip; Aunt Jean is a editor, not on the trip`
- T17 `quality: 3.34 · rewrite drafted, held: rewrite_scored_lower`
- T25 `quality: 2.55 · rewrite drafted, held: rewrite_fact_check_held: a town walk on apr 10 was not set by the customer`
- T39 `quality: 1.57 · rewrite drafted, held: rewrite_scored_lower`

Content checks: none. Dialog status DONE. 49 turns.

## Journey

Dialog PDF is 11 pages. Journey PDF is 86 pages. The manifest `pageCount` is 86, which is 84 screenshots plus cover and contents. `frontMatter` lists cover and contents. Chapter for the itinerary shots is "After the gold conversation".

VERIFY counts a feature file only when a journey page lists it: 35 of 36. It does not say 36/36.

| Surface | What the pages show |
| --- | --- |
| Print/PDF | The PDFs menu is open: Print / PDF, daily printout, and the keepsake layouts. |
| Keepsakes config | Admin gear: logo, summary, and the other keepsake sections. |
| Order Keepsakes | Riley Guest on the shareable link. The page says the trip owner session is absent. The order action is visible. No payment step. |
| Cars | Cars Things. The page shows 0 priced rows. No fixed brand pool and no "Car type" placeholder row. There is no live rental price feed, so ten lowest prices are not claimed. |
| Ratings | GAP. No sourced rating digit was on screen. Ulu Ocean Grill is not claimed as rated. |
| Chat search | GAP. The chat did not ask "add these?". Autonomy stays the system test in `features/autonomous-app-customer-flow.md` and `bot-admin/messages/time-syncher/autonomous-app-customer-flow-20260910`. |
| Voice note | PDF page 19. The microphone control is in the frame. |
| Bubbles | PDF pages 8–10 are the opener, the itinerary reply, and the collaborator upsell. |

The capture script passes the clip-text length into the page. That argument was in the working tree for this journey and is the code commit after `e830a5d`. It does not change the app. The app was not redeployed for it. Both PDF banners stay `e830a5d`.

## sha256

- `dialog-gold-v7-jev-quality.pdf` `f1447d1ee2e64c6687fa695e78d0dc83546ff6a5762488ba789939e23999c080`
- `screenshot-journey.pdf` `7e0dc018ff8c52941fcbcb049053372107d0972bed67d470f07ebcb5c6434924`
- `journey-manifest.json` `5f1bd4996cdc1160d0aed1e689bede945d209668f612251efeb45bbfbad99502`
- `live-transcript.jsonl` `e92969f62cde50cf84d80fd0ae356284108e3fdc10c7ac5984922492d7e1cca8`
- `VERIFY.md` `96b0ad743d2583528bab9ba92c1ea479e2c4d40bd46b97d41f80019033fd190e`
