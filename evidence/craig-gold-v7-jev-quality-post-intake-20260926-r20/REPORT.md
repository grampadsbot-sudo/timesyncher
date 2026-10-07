# r20 Big Island Family v7 — hold certify

Pack `craig-gold-v7-jev-quality-post-intake-20260926-r20`.

Graded drive build `81d853c764095b05d8d4477f3186549ca28441fa`.

Commit time of that build: 2026-09-27 22:29:27 UTC (12:29:27 HST).

Drive start: 2026-09-27T22:30:36.771Z (12:30:36 HST).

Drive end: 2026-09-27T22:33:16.940Z (12:33:16 HST).

That build was deployed to https://vacation-staging.timesyncher.com before the graded drive. Live `/api/version` matched it at drive start and at drive end. The sha stored on every JSONL turn is that build. The dialog cover and journey page 1 print `live 81d853c764095b05d8d4477f3186549ca28441fa https://vacation-staging.timesyncher.com` and `build used vs tip: 81d853c764095b05d8d4477f3186549ca28441fa equals the tip`. Every journey PDF page prints `Capture build`, including EULA pages 5 and 6. Render did not move the tip.

Dialog PDF creation time is 2026-09-27 22:34:10 UTC (12:34:10 HST). Journey PDF mtime is 2026-09-27 22:37 UTC (12:37 HST). Both are after the build commit. The render scripts in that commit are the scripts that produced these PDFs.

Hold certify. No merge. No Pro upgrade. The Vercel `workspace` project was left alone. Staging project is `timesyncher-vacation-staging`.

## Earlier deploy, not the graded drive

`c448cdeac864917b62383026931d7ea78a29e000` was deployed first (`dpl_HBauecEzdx4AQALRedkERA5zCSym`). That drive stopped on Craig turn 1 with HTTP 502: the rewrite was fact-held and the holding reply was rejected, so the route returned an empty reply. Session `963e100e-7ad6-4ef0-9d82-96a33eb23a30` was abandoned. It is not this pack.

`81d853c764095b05d8d4477f3186549ca28441fa` was then deployed (`dpl_F8XBZ4dH996FYbsqK8acUC534Mmr`) and aliased to vacation-staging. The graded drive ran on that deploy. No staging deploy followed the graded drive.

## Security

The r19 JSONL header on public PR #40 carried the owner onboarding session token. That session is `bb37ca55-cbda-4a18-981c-b53951ffb297`. Its previous status was `purchase_confirmed` and its step was `purchase_email_ack`. The token column was replaced with a new random value and the status was set to `revoked`. A lookup of the old token returns 0 rows. No Craig click was required. Collaborator sessions were not in that JSONL header and were not rotated.

PR #40 tip `2a8399065f3028e6b374639ad77de1b7173dc027` stores `sessionToken: null`. Commit `a45a9257232a192752c977afffe1a0918a1573a2` still contains the old string in git history. That value no longer authenticates. This r20 JSONL header also stores `sessionToken: null`. The r20 pack files do not contain the revoked token or the new token.

## r19 claims this pack does not repeat

r19 dialog PDF creation time is 2026-09-27 21:46:47 UTC (11:46:47 HST). r19 journey PDF creation time is 2026-09-27 21:50:56 UTC (11:50:56 HST). Those files were produced before evidence commit `a45a9257232a192752c977afffe1a0918a1573a2` at 2026-09-27 21:53:07 UTC (11:53:07 HST). The r19 REPORT says the evidence commit added the journey capture adjustments and the dialog label fallback, and that those files were not deployed.

The r19 REPORT is wrong on these points: pages 8–10 are not chat bubbles (the images are near-white); pages 55–56 are not the Print/PDF menu or the Keepsakes config (they are tiny Thing-edit crops); the happy-hour page does not show Ulu 3–6 PM (the stored field has no clock time); EULA pages did not print the words `Capture build`; the feature count is not 35 of 36.

## Checks on this tip

`node --check` passed for `src/vacation/live-app-turn.mjs`, `scripts/screenshot-journey-pdf.mjs`, `scripts/live-transcript-dialog-pdf.mjs`, and `scripts/vacation-app-reply-rules.mjs`. `python3 -m py_compile scripts/screenshot_journey_pdf.py` passed.

Passed: `scripts/test_live_transcript_dialog_pdf.mjs`, `scripts/test_screenshot_journey_pdf.mjs`, `scripts/test_build_used_vs_tip.mjs`, `scripts/test_void_stale_build.mjs`, `scripts/test_real_app_entry.mjs`, `scripts/test_vacation_app_shell.mjs`.

`npx vercel@60.1.3 build` of this tip wrote 1 function: `.vercel/output/functions/api/[...route].func`.

Local curls against this tip, with `TIMESYNCHER_BUILD_SHA` set to the tip: `GET /` 200, `GET /api/version` 200 and the body sha is `81d853c764095b05d8d4477f3186549ca28441fa`, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400 (`session is required.`).

## Scale

24 generated replies. Mean of the shipped labeled scores is **3.230**. Rounded bins: 5×0, 4×6, 3×16, 2×2, 1×0.

Session wall 157774 ms. Real per-turn median 5146 ms (the two central values of the 24 app turns are 4813 ms and 5479 ms). Gen-only median on the dialog cover is 4196 ms. Max real per-turn latency is 12741 ms on T23. The dialog timing row `v7 real per-turn latencyMs` prints median 5146, p95 11574, max 12741.

Rewrite-turn median is 9809 ms across 7 turns (rewritten, held, or a stored rewrite attempt): 8271, 8830, 9373, 9809, 10634, 11574, 12741. r19 max was 14886 ms on T39 and the r19 rewrite-turn median was 10266 ms. The r20 cut is the single interim attempt and returning the finished reply on the first request when it exists. Two model calls still dominate a rewrite turn.

Models on the generated turns stay on the allowlist: T1 `google/gemini-2.5-flash-lite` (2), T2 `qwen/qwen3-235b-a22b-2507` (14), T3 `deepseek/deepseek-v3.2` (7), T4 `qwen/qwen3-max` (1). Jev is `typesafe/jev-1.13`. Jev notes are null (`jevNoteReason: jev_no_free_text`). Code did not write reply sentences.

## Change lines

The dialog renderer prints `rewriterChange` only. It does not fill a change line from raw `WHAT_I_CHANGED`. A line is stored only when `verifiedRewriteChange` accepts it. T3 and T7 have a stored line. T11 and T19 are `quality.rewritten` with `rewriterChange` null, so the PDF prints no change line for them.

- T3 `Removed the claim that a swim is saved on the second Friday, as that day is not yet set on the itinerary.` The shipped reply does not claim that Friday swim is saved. Draft fact was `a swim on apr 3 was claimed as saved`. Rewrite fact is `ok`. Score 2.93, draft score 1.93, model `deepseek/deepseek-v3.2`. Beat: `Built itinerary from dump, explained access and plan.`
- T7 `Added Craig, Tyler, and Lauren to the garden morning group to reflect they are traveling, per fact-check flags.` The shipped reply names them on Sunday's garden morning. Score 2.83, draft score 3.11, model `qwen/qwen3-235b-a22b-2507`. Beat: `shaped Sunday garden morning with Kimberly`.

T19's shipped text keeps the Sunday garden, the Monday April 6 swim, and the Friday April 10 dinner. It does not say `we've corrected`. No change line is printed. Score 4.05, draft score 1.74. Beat: `preserved photos for named activities and people`.

## Shipped replies that answer the ask

- T9 shipped the draft. Rain backup names April 10. Fact `ok`. Beat `Provided rain backup plan for swim`. Score 2.79. Model `qwen/qwen3-235b-a22b-2507`.
- T15 shipped the draft. Thursday offers Kimberly's second garden or a town walk. Fact `ok`. Beat `Offered Thursday options and collaborator access choice.` Score 3.46. Model `deepseek/deepseek-v3.2`. No rewrite was stored.
- T39 shipped the draft. It names the second swim for the second Friday, April 10. Fact `ok`. Beat `Confirmed second swim day`. Score 3.26. Model `qwen/qwen3-235b-a22b-2507`. Latency 6111 ms.
- T43 shipped the draft. Welcome Lauren. The text does not give Lauren Kimberly's gardens or Tyler's swim. Fact `ok`. Beat `Welcomed Lauren to the trip.` Score 3.29. Model `deepseek/deepseek-v3.2`.
- T45 shipped the draft. Tuesday offers a town walk or dinner. Fact `ok`. Beat `offered two unstacked options for Tuesday`. Score 3.28. Model `qwen/qwen3-235b-a22b-2507`. No rewrite was stored.
- T47 shipped the draft. Thursday April 9 town walk. Fact `ok`. Beat `Confirmed Thursday town walk`. Score 3.08. Model `qwen/qwen3-235b-a22b-2507`.

T15 and T45 on this drive have no discarded rewrite score. There is no 1.72-vs-1.53 or 1.82-vs-1.36 pair in this JSONL.

## Held turns

`jevScoreDraft` is the draft score. `draftModel` is the draft model. `quality.score` is the shipped interim score. `shippedModel` is the interim model. Beats are null.

- T23 held `rewrite_fact_check_held: Kimberly is traveling; Tyler is traveling; Lauren is traveling`. That string is the omission check: the rewrite named most travelers and left those three out. Draft score 3.54, draft model `qwen/qwen3-235b-a22b-2507`. Shipped score 2.15, shipped model `google/gemini-2.5-flash-lite`. The shipped interim is `It sounds like a wonderful trip to the Big Island, Hawaii with the little ones.` That line does not answer the ages turn. `interimDodges` still lets that tone through when the ask is not a two-option, rain-backup, later-swim, or help line.
- T27 held `rewrite_near_draft`. The rewrite attempt score is null. Draft score 1.53, draft model `deepseek/deepseek-v3.2`. Shipped score 3.42, shipped model `google/gemini-2.5-flash-lite`. The interim is a generic Kimberly welcome.
- T35 held `rewrite_fact_check_held: a town walk on apr 5 was not set by the customer`. The rewrite text places the town walk on Friday, April 10, and gardens on April 5. Draft score 3.58, draft model `deepseek/deepseek-v3.2`. Shipped score 3.66, shipped model `google/gemini-2.5-flash-lite`. The interim is a generic Tyler welcome and says `locked in`.

## Owner and party

The stored party owner is Craig Davidson. Collaborators are Kimberly Davidson (owner pays), Tyler Davidson (self), and Lauren Davidson (self). Kids are Torren, Peyton, Keegan, and Fallon. Marcus Chen is a viewer. Aunt Jean is an editor.

T3 includes collaborators, view access, edit access, and unlimited vacations for the whole year. The shipped turns checked here do not call Kimberly, Tyler, or Lauren the account holder.

## Journey

Dialog PDF is 11 pages. Journey PDF is 80 pages: cover and contents, then 78 screenshots. `pageCount` in the manifest is 80. Chapter for the itinerary shots is "After the gold conversation".

| Surface | What this pack shows |
| --- | --- |
| Welcome crops | PDF pages 10–12. Kimberly, Tyler, and Lauren welcome text is visible. Crops are 736×136, 736×113, and 736×227. |
| EULA | PDF pages 5 and 6. Review Terms & Privacy, then Agree clicked. Both pages print `Capture build`. |
| Print/PDF | GAP. The header PDFs control did not open a Print / PDF menu. This pack does not show Layout 1 or Layout 2. |
| Keepsakes config | PDF page 53. The Keepsakes menu, 760×300, with Style one and Style two. |
| Keepsake Style one | GAP. `style=1` did not stay on vacation-staging. |
| Keepsake Style two | PDF page 56. Rendered on the intake trip. |
| Happy hour | PDF page 52. The stored Ulu Ocean Grill field. The page note adds no clock time. |
| Ratings | GAP. No sourced rating digit was on screen. No rating was invented. |
| Order Keepsakes | PDF page 54. Separate browser context. The image is a sign-in wall and is mostly empty. `data-owner-session` is 0. |
| Cars | PDF page 51. SpeediShuttle, no price, Remove not clicked. Ten lowest prices are a GAP: no live rental price source is available within the allowed tools. There is no Kayak or other rental feed, Google Places is not allowed, and `lowestCarOffers` only lists places that already have a numeric price. The only car Thing is SpeediShuttle, which has no price. Removing that row would leave an empty list, so this journey does not publish an empty list as brand removal. |
| Search | N/A. Removed from the Feature Map by Craig's ruling (SoT jev-note-and-feature-map-gaps-20260927). Not rebuilt. |
| Autonomy | N/A. Removed from the Feature Map by the same ruling. Not rebuilt. |
| Voice note | PDF page 18. |
| Blank rejection | Purchase email and the three collaborator-invite shots were rejected and not published. |
| Day shots | 1280×581. The day-map page is the map under Vacation Day View. |

The journey script printed `features 33 of 36`. That count is not a claim that 33 features are complete. The gap table is the list of misses. Search and autonomy are the two N/A rows.

## sha256

REPORT.md is omitted here so this file does not contain its own hash.

- `dialog-gold-v7-jev-quality.pdf` `94cdf9eeb0162f8618a67d19ac49e03a039b9c460524f61637e843387a1d2091`
- `screenshot-journey.pdf` `b7b8fd2b2e2520c7695e89618aa58dccacd83b58e822f778bc943bcacb252a70`
- `journey-manifest.json` `7f166444aafa46e83d3fb9ac48abb6cb901890b29e156b866e66ef510b4dc16d`
- `live-transcript.jsonl` `8e16e7abf1c8ca6c0abeb8fd3ca39a7452aa229deb3d2d8ebc2e923ee5a04b01`
- `VERIFY.md` `8656df0ba8fa9c5da70de339a3e62584267b93f36ebf4846b1cc1ef36e31c253`
