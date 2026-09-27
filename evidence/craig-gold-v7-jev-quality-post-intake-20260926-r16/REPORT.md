# Craig gold v7 Jev quality, post-intake, r16

Hold certify. No merge.

Live sha `13582d503d586e713e78ac8016c944b7e14e1108`. `/api/version` matches. Both PDFs print it. One staging deploy, project `timesyncher-vacation-staging`. The workspace project was not touched.

r15 is void. This drive is a new session. Prior gold sessions were banned, including r15.

## Result

- Turns: 49. Generated app replies: 24. Session wall: 182569 ms.
- Labeled mean (raw + 1): 3.441. Histogram: 5×0, 4×13, 3×9, 2×2, 1×0.
- Real per-turn median: 5360.5 ms. Gen-only median: 4515.5 ms.
- Rewrites that shipped: 3. Rewrite attempts: 6. Flagged turns: 0.
- Dialog PDF title: Big Island Family v7. Content check recorded, file still written.
- Journey: 33 of 36 feature files, 82 pages, 3 gaps.

## Content checks

- FAIL. post_intake_itinerary_collab_upsell. The intake reply says "I'll build the itinerary" rather than "building the itinerary" or "building your itinerary". It does offer view access, edit access, the email invite, and unlimited vacations for the whole year. This is a FAIL line in the dialog PDF, this report, and VERIFY.md. The PDF was written and stamped.
- The payer check accepts `Kimberly's $27, paid by you` as the same fact as `Kimberly $27, paid by you`. Reply text was not edited in code.

## Residuals

- Later swim: Tyler's later-swim turn still says "later in the week" in the reply. The saved trip on the following turns has swim days Apr 6 and Apr 10. The second Friday is the saved day.
- Tuesday swim: the Tuesday replies offer a town walk and a dinner. They do not offer an unset Tuesday swim. T11 was rewritten for that.
- Arrival day: T5 is SpeediShuttle and groceries. It does not offer a pool dip. A pool dip on the arrival day is a fact error.
- Flagged drafts: 0 turns stayed flagged. Three rewrites shipped with a Rewriter line. When a rewrite did not ship, the turn stayed a fact-clean reply.
- Ratings and reviews: not captured. The bundle shows Google rating, Yelp rating, and Other rating only when the value contains a digit (`hideUnsourcedRatings` in `src/vacation/trek-style2-bundle.mjs`). No staging shared payload has a numeric `googleRating`, and repo history has no sourced numeric rating to port. An empty box was not turned back on.
- Print / PDF and Keepsakes config: not captured on this intake page. The live bundle contains the Print / PDF menu and the Admin list (TimeSyncher Vacation logo, Initial summary page, and the other sections). The intake shared header that rendered exposed Order Keepsakes, the day tabs, and the voice control, and did not mount the PDFs button. No second copy was ported and there was no second deploy.

## Feature map

| Feature | Result |
| --- | --- |
| Captured | 33 of 36 |
| Ratings and reviews | GAP. No sourced numeric rating on this trip. |
| Print and PDF | GAP. PDFs button not mounted on the intake header. |
| Keepsakes config | GAP. Admin gear is inside that PDFs menu. |

## Per-turn log

| Turn | Who | ms | Score | Flag | Fact | Reply |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | opener | 0 | | | | Welcome. I am here to build this vacation with you. Your website is not built yet, so this chat is the whole workspace until it is actual... |
| 2 | customer |  | | | | okay voice note dumping — sorry it's a ramble. Big Island Hawaiʻi, not Oahu. We leave Friday April third and come home Sunday April twelf... |
| 3 | app | 5626 | 2.39 |  | ok | Alright, I've got the whole intake dump for your Big Island week. I'll build the itinerary from that. For your collaborators, view access... |
| 4 | customer |  | | | | Friday April third is arrival only. SpeediShuttle into Kailua-Kona, then groceries at the house. No second outing that day. |
| 5 | app | 1374 | 4.05 |  | ok | Got it. Friday, April 3rd, is all about arriving at the Kailua-Kona house via SpeediShuttle and grabbing groceries. No other activities a... |
| 6 | customer |  | | | | Sunday April fifth is a garden morning for Kimberly. Give me a morning shape and tell me where a note about the garden should live. |
| 7 | app | 9222 | 3.92 |  | ok | Sunday, April 5th is set for Kimberly’s garden morning, so we’ll keep it light and lovely—just a slow start at the house with breakfast, ... |
| 8 | customer |  | | | | If Monday April sixth rains, what is the backup for Tyler so the swim still happens later and the beach plan does not just vanish? |
| 9 | app | 16794 | 2.9 |  | a swim on apr 6 was not set by the customer | I am keeping this reply to the saved trip. |
| 10 | customer |  | | | | Tuesday April seventh is the big activity. Offer two things the party of eight could actually do, then let Lauren pick. Do not book anyth... |
| 11 | app | 17071 | 2.78 | rewrite | that phrase is not the trip end | Tuesday, April 7th is your big activity day with the whole crew of eight—Craig, Torren, Peyton, Keegan, Fallon, and Lauren, plus the two ... |
| 12 | customer |  | | | | Leave Wednesday April eighth afternoon empty. The party of eight needs one day that is not a plan. |
| 13 | app | 4208 | 2.58 |  | ok | Wednesday, April 8th will stay wide open after lunch for the full group—Craig, Torren, Peyton, Keegan, Fallon, and Lauren, plus the two o... |
| 14 | customer |  | | | | Walk me through Thursday April ninth? Kimberly wanted a second garden or a town walk, and Lauren should not stack a second big activity t... |
| 15 | app | 5630 | 2.86 |  | ok | Thursday, April 9th is a day for Kimberly's second outing. Since Lauren's rule is in play, we won't add another big activity on top of it... |
| 16 | customer |  | | | | Food matters. Groceries stay on arrival day, Friday April third, after the shuttle. Friday April tenth is the dinner. Other days we cook ... |
| 17 | app | 7042 | 3.46 |  | ok | Got it—food is front and center, and you’ve got a clear rhythm. Friday, April 3rd stays grounded in groceries after the shuttle lands, so... |
| 18 | customer |  | | | | Photos of the gardens, the late swim, and the Friday dinner should stay with this vacation. Kimberly will want the garden pictures. Tyler... |
| 19 | app | 6232 | 3.85 |  | ok | The garden photos from Sunday, April 5th will be easy to spot—soft morning light, colorful blooms, and the kids wandering the paths. We’l... |
| 20 | customer |  | | | | What matters most is the people, not a packed list. Say that back in a human way, and keep us on the Big Island. |
| 21 | app | 2532 | 4.11 |  | ok | Exactly right. The list exists to hold a few key days—like the gardens on Sunday or that Friday dinner—so you don't have to think about t... |
| 22 | customer |  | | | | Fallon is two and quiet. Torren is eight, Peyton is six, Keegan is four. Keep the days gentle enough for them. |
| 23 | app | 5283 | 4.02 |  | ok | Got it. With Torren at eight, Peyton at six, Keegan at four, and little Fallon just two, the rhythm of the trip stays soft and simple. Bi... |
| 24 | customer |  | | | | How much is it if Kimberly, Tyler, and Lauren join as collaborators? I want the household plan named unlimited vacations for the whole ye... |
| 25 | app | 4293 | 3.98 |  | ok | The plan you’re choosing is unlimited vacations for the whole year. Each collaborator seat costs $27. Here’s how it breaks down: Kimberly... |
| 26 | customer |  | | | | Kimberly Davidson: Craig paid for this seat with the coupon. I accepted the EULA terms and clicked join. Keep us on the Big Island. |
| 27 | app | 13783 | 3.47 |  | apr 5 is not the trip end | Welcome aboard, Kimberly. We're excited to have you join the trip to the Big Island, Hawaii. Craig has indeed covered your seat with the ... |
| 28 | customer |  | | | | This is Kimberly. Sunday April fifth garden morning in Kailua-Kona still works. Put the garden note on that day. |
| 29 | app | 1970 | 3.52 |  | ok | The gardens on Sunday, April 5th, are officially noted for your morning in Kailua-Kona. It sounds like a perfect way for Kimberly to enjo... |
| 30 | customer |  | | | | If we add a second garden, keep it on Thursday April ninth and leave Wednesday afternoon empty. |
| 31 | app | 5302 | 3.55 |  | ok | The second garden is set for Thursday, April 9th, just as you wanted—keeping that day light and focused on the blooms. Wednesday afternoo... |
| 32 | customer |  | | | | Read just my two days back, Sunday and Thursday, and stay on the Big Island. |
| 33 | app | 3779 | 4 |  | ok | The garden on Sunday, April 5th, is set for a calm morning among the blooms in Kailua-Kona—perfect timing with the little ones’ rhythms. ... |
| 34 | customer |  | | | | Tyler Davidson paid for my own seat with the coupon. I accepted the EULA terms and clicked join. Keep us on the Big Island. |
| 35 | app | 15831 | 3.4 |  | a swim on apr 10 was not set by the customer | Welcome aboard, Tyler. We're excited to have you join us on the Big Island. This is going to be a fantastic trip with plenty of sunshine ... |
| 36 | customer |  | | | | This is Tyler. Monday April sixth swim is the beach unless it is windy, then the house pool. Save that on Monday. |
| 37 | app | 1465 | 3.21 |  | ok | It sounds like a great plan for Monday, April 6th, Tyler. The flexibility to choose between the beach or the house pool based on the weat... |
| 38 | customer |  | | | | I still want one later swim in the week at Kailua-Kona. Do not stack it on Lauren’s big day. |
| 39 | app | 5149 | 3.59 |  | ok | Got it, Tyler. We’ll keep that second swim open for later in the week in Kailua-Kona, giving you the freedom to choose the perfect moment... |
| 40 | customer |  | | | | Read Monday April sixth back, with the beach or the house pool, and keep that swim on the Big Island. |
| 41 | app | 3892 | 3.84 |  | ok | Monday, April 6th is set for a relaxed swim, with the choice between the beach or the house pool depending on the wind—perfect for keepin... |
| 42 | customer |  | | | | Lauren Davidson paid for my own seat with the coupon. I accepted the EULA terms and clicked join. Keep us on the Big Island. |
| 43 | app | 11052 | 3.9 | rewrite | a swim on apr 3 was not set by the customer; a swim on apr 5 was not set by t... | Welcome aboard, Lauren. With you joining, the traveling crew for the Kailua-Kona house from Friday, April 3 to Sunday, April 12 is Craig,... |
| 44 | customer |  | | | | This is Lauren. Tuesday April seventh should be one big thing, not two. I will pick after you offer two options. Do not book anything. |
| 45 | app | 4955 | 2.15 |  | ok | Tuesday, April 7th is wide open, Lauren, and we’re keeping it that way—just one solid option at a time, no stacking. Since you’re tuned i... |
| 46 | customer |  | | | | Thursday April ninth can be a town walk. That is not my big day. |
| 47 | app | 11876 | 3.34 | rewrite | a garden on apr 7 was not set by the customer | Thursday, April 9th is set for both gardens and the town walk—two things you’ve already confirmed for that day. Since you mentioned it’s ... |
| 48 | customer |  | | | | Keep Wednesday April eighth afternoon empty for the whole party, and stay in Kailua-Kona. |
| 49 | app | 5419 | 3.71 |  | ok | Wednesday, April 8th will stay wide open for the whole group—no bookings, no plans, just pure flexibility for however the mood strikes. W... |

