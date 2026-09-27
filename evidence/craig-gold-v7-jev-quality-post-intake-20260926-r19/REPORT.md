# r19 Big Island Family v7 — hold certify

Drive build `128c9e1781f2f9ce4f0bf2396cf1ccdce136540e`.

Commit time of that build: 2026-09-27 21:30:44 UTC (11:30:44 HST).

Drive start: 2026-09-27T21:36:03.910Z (11:36:03 HST).

Drive end: 2026-09-27T21:39:05.782Z (11:39:05 HST).

That build was deployed to https://vacation-staging.timesyncher.com before the drive. Live `/api/version` matched it at drive start and at drive end. The sha stored on every turn is that build. The dialog cover and journey page 1 print `live 128c9e1781f2f9ce4f0bf2396cf1ccdce136540e https://vacation-staging.timesyncher.com` and `build used vs tip: 128c9e1781f2f9ce4f0bf2396cf1ccdce136540e equals the tip`. Each journey screenshot page prints that same capture build. Render did not overwrite `buildSha`.

The drive was recorded once. There was no second deploy. Hold certify. No merge. The Vercel `workspace` project was left alone.

The evidence commit adds the journey capture adjustments (keepsakes clip text, Remove clicks on Cars, per-page capture build on the EULA shots) and the dialog label fallback that prints the rewriter's own `WHAT_I_CHANGED` line. Those files were not deployed. Reply code on the drive build is the deployed tip.

Local `vercel build` of this tip wrote 1 function: `.vercel/output/functions/api/[...route].func`.

Local curls against this tip: `GET /` 200, `GET /api/version` 200 and the body sha is `128c9e1781f2f9ce4f0bf2396cf1ccdce136540e`, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400 (`session is required.`).

## Scale

24 generated replies. The opener is outside the mean. Mean of the shipped labeled scores is **3.351**. Rounded bins: 5×0, 4×11, 3×9, 2×4.

Session wall 179068 ms. Real per-turn median 5573 ms. Gen-only median 3959.5 ms. Max real per-turn latency 14886 ms on T39.

Models on the generated turns stay on the allowlist: T1 `google/gemini-2.5-flash-lite`, T2 `qwen/qwen3-235b-a22b-2507`, T3 `deepseek/deepseek-v3.2`, T4 `qwen/qwen3-max`. Jev is `typesafe/jev-1.13`. Jev notes are null (`jevNoteReason: jev_no_free_text`). Code did not write reply sentences.

Nine rewrite drafts. Three shipped (T3, T19, T43). Six were held. A rewrite that cannot ship does not get a second score.

Shipped change lines are the rewriter's own `WHAT_I_CHANGED` line from that same call:

- T3 `Removed the claim that a swim was already saved on April 10th, as it was not yet on the saved itinerary.`
- T19 `Removed false claim that a swim was saved on April 10 and corrected it to April 6 as per the itinerary.`
- T43 `I removed the unsaved claim for a town walk on April 10th, as the customer did not set it.`

Held lines in the dialog PDF, with the shipped score:

- T5 `quality: 3.49 · rewrite drafted, held: rewrite_fact_check_held: a swim on apr 10 was claimed as saved`
- T9 `quality: 2.05 · rewrite drafted, held: rewrite_fact_check_held: a swim on apr 10 was not set by the customer`
- T15 `quality: 2.53 · rewrite drafted, held: rewrite_scored_lower`
- T39 `quality: 4.1 · rewrite drafted, held: rewrite_fact_check_held: Lauren's rule is no two big activities stacked on the same day; a swim on apr 10 was not set by the customer; a town walk on apr 10 was not set by the customer`
- T45 `quality: 2.36 · rewrite drafted, held: rewrite_scored_lower`
- T47 `quality: 3.23 · rewrite drafted, held: rewrite_fact_check_held: Lauren's rule is no two big activities stacked on the same day`

## Owner and party

The stored party owner is Craig Davidson. Collaborators are Kimberly Davidson, Tyler Davidson, and Lauren Davidson. Kids are Torren, Peyton, Keegan, and Fallon. Marcus Chen is a viewer. Aunt Jean is an editor. The shipped turns do not call Kimberly, Tyler, or Lauren the account holder.

T3 includes collaborators, view access, edit access, and unlimited vacations. T7, T11, T13, T19, and T23 name Kimberly, Tyler, and Lauren in the traveling crew.

## Journey

Dialog PDF is 11 pages. Journey PDF is 87 pages. The manifest `pageCount` is 87, which is 85 screenshots plus cover and contents. Chapter for the itinerary shots is "After the gold conversation".

| Surface | What the pages show |
| --- | --- |
| Onboarding bubbles | PDF pages 8–10 are the opener, the itinerary reply, and the collaborator upsell. |
| Print/PDF | PDF page 55. The menu shows Print / PDF, Daily printout, Layout 1, and Layout 2. |
| Keepsakes config | PDF page 56. Logo, initial summary, event summary, and Style one / Style two. |
| Happy hour | PDF page 54. Ulu Ocean Grill happy hour 3:00 PM–6:00 PM. |
| Ratings | GAP. No sourced rating digit was on screen. |
| Order Keepsakes | PDF page 57. Riley Guest opened the shareable URL in a separate browser context. `document.cookie` was empty and `data-owner-session` is 0. The page says it was opened without the trip owner session. |
| Cars | PDF page 52 shows SpeediShuttle with Price TBD and the Remove control. Priced rows on that image: 0. PDF page 53 is the list after Remove. SpeediShuttle is absent there. Ten lowest prices are a GAP: the live page has no rental price. |
| Chat search | GAP. Search was removed from the feature map. N/A. |
| Autonomy | GAP. The autonomy bar was removed from the feature map. N/A. |
| Voice note | PDF page 19. |

## sha256

- `dialog-gold-v7-jev-quality.pdf` `06ec57a2f4b2c47b7a0535779f201885d6f34bde682302f837c0a2a8b3f8da1f`
- `screenshot-journey.pdf` `2d1c88314ce816e8f562a6c8c6099de6ec52c8a4da84115c318cbf408414bc27`
- `journey-manifest.json` `a230368834b23ac63035499b1f085a1bff613eed125c4b6dfcbc5620ef8aa22a`
- `live-transcript.jsonl` `0543d0c5058eacde7789f1324c50ec0a6a916b798acf1d23ff9a66aeed4e2aa8`
- `VERIFY.md` `fec1a1d294cbe7eb3c1d7e39e12244421a39d8406e1e0fda523b5f84f18196b1`
