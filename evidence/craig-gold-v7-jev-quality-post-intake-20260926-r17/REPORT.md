# r17 Big Island Family v7 — hold certify

Deployed tip `ef226e696c7bb0320b596b0d651a6890c03fdd8e` on https://vacation-staging.timesyncher.com. Live `/api/version` returns that sha. Both PDFs print it. `assertBothPdfsMatchLive` ran from the journey build and printed `both PDFs match live ef226e696c7bb0320b596b0d651a6890c03fdd8e`.

No second staging deploy. The Vercel `workspace` project was left alone. No merge.

Local `vercel build` of this tip wrote 1 function: `api/[...route].func`.

Live status codes on that hash: `GET /` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

## Scale

24 generated replies. The opener is outside the mean. Mean of the shipped labeled scores (raw + 1) is **3.497**. Histogram of rounded labeled bins: 4×15, 3×7, 2×1, 1×1. The 1 is T3 at 1.48. The 2 is T9 at 2.10.

Session wall 181936 ms. Real per-turn median 5324 ms. Gen-only median 4524 ms. Gen-only p95 6015 ms.

Models on the generated turns: T1 `google/gemini-2.5-flash-lite`, T2 `qwen/qwen3-235b-a22b-2507`, T3 `deepseek/deepseek-v3.2`, T4 `qwen/qwen3-max`. Jev is `typesafe/jev-1.13`. The allowlist is unchanged. Jev notes are null on every turn (`jevNoteReason: jev_no_free_text`). Code did not write reply sentences.

## Held turns

Two turns shipped an interim and are marked `held: true` and `flagged: held`. The shipped model is `google/gemini-2.5-flash-lite`. The printed score is the Jev score of that shipped text.

| Turn | Shipped score | What shipped |
| --- | --- | --- |
| T17 | 4.03 | Groceries on Friday, April 3, and dinner on Friday, April 10. Draft fact check was `Friday is not midweek`. |
| T35 | 3.93 | Welcome aboard, Tyler, staying on the Big Island. Draft fact check was a town walk on April 10. |

The canned line "I am keeping this reply to the saved trip" is absent. T9 and T27 shipped model drafts, scored as those drafts.

## Rewrites

Five turns have `rewritten: true`. Three of those kept a change line from the rewrite model. Two (T5, T19) had the change line dropped, so the PDF has no rewriter line for them. Eight rewrite attempts were logged.

Shipped change lines:

- T27, deepseek/deepseek-v3.2: "I removed the unscheduled garden and town walk options for April 9th and corrected the group list to include the traveling account holder and her children, while respecting all saved activity dates." April 9 is in the draft and absent from the shipped welcome. The draft names Craig; the shipped welcome does not. The inclusion claim is contradicted by that diff.
- T39, qwen/qwen3-235b-a22b-2507: "I moved the later swim to Friday, April 10th after dinner and clarified it’s not stacked on a big day, aligning with Lauren’s rule and only using named activities and dates." The shipped reply tells Tyler the later swim is saved on Friday, April 10. The draft already named that Friday.
- T45, qwen/qwen3-235b-a22b-2507: "Fixed the draft by removing the incorrect garden option and Tyler’s name, ensuring only correct travelers and pre-approved activities were included." The draft offers a garden and names Tyler. The shipped reply offers a town walk or the house pool and does not name Tyler.

## Fact check

T3 names Craig with Torren, Peyton, Keegan, and Fallon, and says it is building the itinerary. It also states view access, edit access, the email invite, and unlimited vacations for the whole year. Content checks passed. The labeled score is 1.48.

T9 ships the qwen draft at 2.10. It tells Craig that a Monday rain moves the beach swim to an already-saved Friday, April 10 backup. That Friday swim had not been saved yet. The fact check recorded `ok`.

T11 offers one Tuesday activity, a Kailua-Kona town walk or a group dinner, and names Craig in the party of eight.

T39 saves the later swim on Friday, April 10, after dinner, and says it is not stacked on a big day.

T43 welcomes Lauren, names the Sunday and Thursday gardens, the Monday swim, and the later swim on Friday the 10th. It does not put a town walk on Friday.

T47 keeps Thursday, April 9 as gardens plus the town walk, and says that is not Lauren's big day.

## Opener

T1 `jevScoreDraft` is null. `latencyMs`, `sessionE2eMs`, and `interimReply.ms` are null in the stored turn and in the dialog PDF. `jevScoreRaw` and `draftJevScoreRaw` print `null` in this pack PDF. The tip's producer log still passes a null raw score through `Number()`, which prints 0. This pack was rendered with that coercion removed, then the script was restored so the branch tip stays the deployed sha. A fresh run of the tip script also rejects the three rewriter lines, because pypdf wraps them and `latin()` straightens apostrophes, so `pdf.includes(label)` misses two of the three. The lines are in the PDF. The pack-time check folded whitespace and those punctuation marks, then the script was restored.

## Journey

The journey PDF is **87 pages**. The manifest `pageCount` is 85 screenshot pages. The other two pages are the cover and the contents list. `pdfinfo` reports 87. Dialog PDF is 11 pages.

Contents entries 6–8, which land on PDF pages 8–10, are the first onboarding prompt, building the itinerary, and the collaborator explanation. Those crops include the chat pane.

Captured in the journey:

| Surface | Capture |
| --- | --- |
| Print/PDF Layout 1 and Layout 2 | PDFs menu open: Layout 1 and Layout 2 |
| Keepsakes config | Admin gear, then Keepsakes |
| Ratings and reviews | Ulu Ocean Grill happy-hour sentence in the review field |
| Cars as Things | Cars tab lists the ten lowest-price rentals, Payless through National |
| Order Keepsakes | Guest page, no owner session: anyone with the link can order, Layout 1 and Layout 2 |
| Purchase, email, EULA, welcomes | Purchase confirmed, purchase email, email click, EULA first, Agree, Kimberly, Tyler, Lauren |

GAPs outside the feature-file table:

- The chat never said "add these?". There is no chat-search screenshot. Autonomy stays the system test in `features/autonomous-app-customer-flow.md` and GBrain `bot-admin/messages/time-syncher/autonomous-app-customer-flow-20260910`. Trip View is removed from the served bundle. VERIFY.md records both.
- The Remove-a-brand bar did not mount on the Cars click, so there is no brand-removal page. The ten rental Things are on the Cars tab.

Feature-file gaps in VERIFY.md: none. 36 of 36 feature files captured. The customer app does not show a Jev score line.

## Feature map

| Ruling | Surface | This drive |
| --- | --- | --- |
| Remove | Cursor project contract | Not in the journey |
| Remove | Search screen | Chat is the search. No "add these?" bubble on this drive |
| Remove | Autonomy bar | System test only, named in VERIFY.md |
| Remove | Trip View | Removed from the bundle. Not in the journey |
| Remove | Telegram intake | Not in the journey |
| Already built | Print/PDF Layout 1 and Layout 2 | Captured |
| Already built | Keepsakes config | Captured |
| Already built | Ratings and reviews | Captured on Ulu Ocean Grill |
| Build | Order Keepsakes | Guest URL captured |
| Car is not a page | Cars as Things | Ten lowest prices captured. Brand removal was not captured |

## What 54b6de9 changed versus b0f8802

Commit `54b6de9eed4809080b4d1037e3f42d2dff80dce0`, message "Stamp both PDFs from the live sha and hold flagged drafts." Parent `b0f8802`, message "Do not treat a denied swim or garden day as a committed one." 15 files, +440 / −136.

- `api/[...route].mjs`
- `routes/keepsake-order.mjs` (+99)
- `scripts/live-transcript-dialog-pdf.mjs`
- `scripts/live_v7_dialog_pdf.py`
- `scripts/screenshot-journey-pdf.mjs`
- `scripts/test_api_route_bundle.mjs`
- `scripts/test_live_transcript_dialog_pdf.mjs`
- `scripts/test_real_app_entry.mjs`
- `scripts/vacation-app-reply-rules.mjs`
- `scripts/void-stale-build.mjs` (+16, `assertBothPdfsMatchLive`)
- `shared-app.html`
- `src/vacation/car-offers.mjs`
- `src/vacation/intake-shared-trip.mjs`
- `src/vacation/live-app-turn.mjs` (+209)
- `src/vacation/trek-style2-bundle.mjs`

## Per-turn log

Shipped model, labeled score of the shipped text, and latency. The opener has null timing and a null score.

| Turn | Shipped model | Score | Kind | Latency ms |
| --- | --- | --- | --- | --- |
| T1 | opener | null | opener | null |
| T3 | deepseek/deepseek-v3.2 | 1.48 | draft | 18493 |
| T5 | google/gemini-2.5-flash-lite | 4.12 | rewrite, line dropped | 3360 |
| T7 | qwen/qwen3-235b-a22b-2507 | 3.64 | draft | 4992 |
| T9 | qwen/qwen3-235b-a22b-2507 | 2.10 | draft | 5339 |
| T11 | deepseek/deepseek-v3.2 | 3.13 | draft | 5371 |
| T13 | qwen/qwen3-235b-a22b-2507 | 3.16 | draft | 3488 |
| T15 | deepseek/deepseek-v3.2 | 2.98 | draft | 4476 |
| T17 | google/gemini-2.5-flash-lite | 4.03 | held | 11618 |
| T19 | qwen/qwen3-235b-a22b-2507 | 3.65 | rewrite, line dropped | 14793 |
| T21 | deepseek/deepseek-v3.2 | 3.53 | draft | 5308 |
| T23 | qwen/qwen3-235b-a22b-2507 | 4.07 | draft | 6064 |
| T25 | qwen/qwen3-max | 3.63 | draft | 4925 |
| T27 | deepseek/deepseek-v3.2 | 3.63 | rewrite | 12254 |
| T29 | google/gemini-2.5-flash-lite | 4.24 | draft | 1389 |
| T31 | qwen/qwen3-235b-a22b-2507 | 3.71 | draft | 5245 |
| T33 | deepseek/deepseek-v3.2 | 3.27 | draft | 3524 |
| T35 | google/gemini-2.5-flash-lite | 3.93 | held | 11085 |
| T37 | google/gemini-2.5-flash-lite | 3.19 | draft | 1433 |
| T39 | qwen/qwen3-235b-a22b-2507 | 4.47 | rewrite | 14916 |
| T41 | qwen/qwen3-235b-a22b-2507 | 4.19 | draft | 6496 |
| T43 | deepseek/deepseek-v3.2 | 2.87 | draft | 5043 |
| T45 | qwen/qwen3-235b-a22b-2507 | 3.58 | rewrite | 8958 |
| T47 | qwen/qwen3-235b-a22b-2507 | 3.36 | draft | 5857 |
| T49 | qwen/qwen3-235b-a22b-2507 | 3.97 | draft | 4217 |

## sha256

| File | sha256 |
| --- | --- |
| dialog-gold-v7-jev-quality.pdf | `b5e9cc89c10a73fb4ad12916ad73c3f8167c931499fcedf9f9d43d05271f69ec` |
| screenshot-journey.pdf | `264dc8def09e8edae363cc617bf7b4abceaa0d13e0707c00cf49670d71e2af31` |
| journey-manifest.json | `6f8e36e7b7357c3b54a7c5c9535099f55dcef87d930b5f3ef3c7f6577d187c57` |
| live-transcript.jsonl | `be34cded5bb13f8932f295bbf7173583b4db0f83307bc248cde125b8db515325` |
| VERIFY.md | `7bbe7916068c11dadce28faf940b720eb57b570c1c913c79909771544078a303` |

Hold certify. No merge.
