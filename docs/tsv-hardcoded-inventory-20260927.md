# Hard-coded dialog and trip-fill inventory

Read-only inventory of `cursor/jev-quality-r20-1128` at `2314742a0e1d8284e3309e29867a7f23fb4a793a`. No app code was changed. SoT: `bot-admin/messages/time-syncher/live-search-hold-no-hardcoded-content-20260927`.

`searchPois` is not called from `routes/vacation-itinerary.mjs` or `src/vacation/shared-trip-handler.mjs`. The only production caller is `scripts/vacation-public-research-worker.mjs`.

## 1. Hard-coded place lists and seeded Things fills

- `src/vacation/keepsake-list-minimums.mjs:12` — `KEEPSAKE_LIST_FILL` is the Las Vegas name list: 15 restaurants (Mon Ami Gabi through Carbone), 10 stores (Crystals at Aria through Miracle Mile Shops), 15 rest items (Bellagio Fountains through High Tea Conservatory Walk).
- `src/vacation/keepsake-list-minimums.mjs:69` — `padKeepsakeListNames` appends those names until the bucket hits 15 / 10 / 15.
- `src/vacation/keepsake-list-minimums.mjs:86` — `LIVE_TAB_FILL` points restaurant, store, and rest at the same Las Vegas names. `padLiveTabRows` at line 92 does not append them; it returns the rows it was given.
- `src/vacation/keepsake-list-minimums.mjs:97` — `KEEPSAKE_FILL_DETAILS` stores a Las Vegas lat/lng and a written summary for each of those names.
- `src/vacation/keepsake-list-minimums.mjs:140` — `BIG_ISLAND_LIST_FILL` is the intake catalog: 15 restaurants (Huggo's through Pine Tree Cafe), 10 stores (Kings' Shops through Kona Inn Shopping Village), 15 rest places (Hawaiʻi Volcanoes National Park through Papakōlea Green Sand Beach), including Hilo names.
- `src/vacation/keepsake-list-minimums.mjs:189` — `BIG_ISLAND_FILL_DETAILS` stores a lat/lng, address, and summary for each Big Island fill name.
- `src/vacation/keepsake-list-minimums.mjs:269` — `catalogForShared` uses the Big Island fill when `timesyncherIntake === true`, and the Las Vegas fill otherwise.
- `src/vacation/keepsake-list-minimums.mjs:288` — `padKeepsakeSharedPlaces` pushes the missing catalog names onto `shared.places` with `__tsKeepsakeFill: 1`, category, coords, summary, and a logo.
- `src/vacation/shared-trip-handler.mjs:73` — intake share GET pads the trip built from saved things before presentation.
- `src/vacation/shared-trip-handler.mjs:133` — upstream shared GET pads the merged trip on every load.
- `src/vacation/pre-collaborator-snapshot.mjs:21` — the pre-collaborator snapshot is padded the same way.
- `src/vacation/live-app-turn.mjs:769` — `intakeFacts` builds keyword Things, not searched places: Big Island, Gardens, Groceries, Dinner, Swim, Town walk, and Kailua-Kona house (lines 793–799) when those words appear.
- `src/vacation/intake-shared-trip.mjs:221` — `PLACE_COORDS` pins those keyword titles, plus SpeediShuttle, KOA arrival, and Kona arrival, to fixed coordinates.
- `src/vacation/intake-shared-trip.mjs:234` — `coordsFor` prefers `BIG_ISLAND_FILL_DETAILS`, then `PLACE_COORDS`.
- `routes/vacation-itinerary.mjs:661` — `ensureIntakeItinerary` inserts each `intakeFacts` thing with empty `location` and empty `ratings` and `source: 'long-intake'` (insert at lines 703–717). It does not call search.
- `src/vacation/keepsake-product-overrides.mjs:4` — `PRODUCT_VENUE_COORDS` maps Shake Shack, Carbone, Eggslut, Cosmopolitan, Lotus of Siam, Conservatory, Bellagio, flights, and Las Vegas to fixed coordinates when a place has none.
- `src/vacation/keepsake-product-overrides.mjs:58` — `PRODUCT_THING_FIELDS` writes canned summaries, long details, and happy-hour copy onto Carbone, Shake Shack, Lotus of Siam, Eggslut, and the Bellagio Conservatory when those fields are empty. Applied at line 154.
- `src/vacation/trek-style2-bundle.mjs:232` — `AREA_CHIP_BIG_ISLAND` replaces the area chips with ten hard-coded Big Island area names. Line 234 adds Vegas and NYC name-to-coordinate tails.

## 2. Placeholder cars, flights, and the house hotel

- `src/vacation/intake-shared-trip.mjs:320` — if no place is named SpeediShuttle, `applyThingPresentation` inserts one as category Car, rental company SpeediShuttle, car type "Shared shuttle", airport coordinates, and no price.
- `src/vacation/intake-shared-trip.mjs:114` — SpeediShuttle summary is the fixed sentence "SpeediShuttle from the Kona airport to the Kailua-Kona house on arrival day."
- `src/vacation/intake-shared-trip.mjs:351` — if no place matches KOA arrival or Kona arrival, it inserts one. The name is "KOA arrival" when the trip JSON contains KOA, otherwise "Kona arrival". Category Flight. Takeoff is the trip start date. No airline from the customer.
- `src/vacation/intake-shared-trip.mjs:115` — that flight's summary is "Arrival into Kona… then the shuttle and groceries the same day."
- `src/vacation/intake-shared-trip.mjs:388` — `lowestCarOffers` only adds car rows that already have a numeric price. The inserted SpeediShuttle has no price, so this adds nothing.
- `src/vacation/live-app-turn.mjs:799` — the only hotel `intakeFacts` creates is "Kailua-Kona house" when the text has both "house" and "kailua-kona".
- `src/vacation/intake-shared-trip.mjs:89` — `categoryFor` maps `category === 'hotel'` to Hotel and every other thing to Attraction, so the house is the hotel tab.
- `src/vacation/intake-shared-trip.mjs:112` — house copy is "The Kailua-Kona house" plus an optional date.
- `src/vacation/poi-search.mjs:272` — `flightPlan` can ask which airline. Nothing in the trip-fill path calls it. Tests are the only caller.

## 3. Canned dialog, template replies, and code-built labels

Strings the code writes into the customer chat:

- `src/vacation/live-app-turn.mjs:23` — `ONBOARDING_OPENER_WITH_SITE` is the full returning-trip welcome, including view access, edit access, and the email-invite paragraph.
- `src/vacation/live-app-turn.mjs:24` — `ONBOARDING_OPENER_CHAT_ONLY` is the full first-run welcome, including "Your website is not built yet."
- `src/vacation/live-app-turn.mjs:36` — `onboardingOpenerText` picks one of those two strings.
- `routes/vacation-itinerary.mjs:281` — `ensureOnboardingOpener` inserts that string as transcript turn 1, speaker app. No model call.
- `vacation-app.html:629` — when the client has no turns, it renders the same two welcome strings itself.

Code-built Thing copy:

- `src/vacation/intake-shared-trip.mjs:97` — `productThingSummary` builds the customer-facing note for Groceries, Gardens, Swim, Dinner, Town walk, the house, Big Island, SpeediShuttle, and the Kona arrival flight from title templates, not from the chat sentence.
- `src/vacation/intake-shared-trip.mjs:311` — Ulu Ocean Grill gets tags Seafood and Cocktail Bar / Happy Hour, `happyHour: true`, and the sentence "Ocean bar happy hour at Ulu Ocean Grill. Recheck the Four Seasons Hualalai listing before the trip." Huggo's and Fish Hopper get the Seafood tag at line 315.

Sentences the reply prompt orders the model to say:

- `scripts/vacation-app-reply-rules.mjs:593` — after a long intake, the reply must say it is building the itinerary, then "View access lets them see the days", "Edit access lets them add notes after you approve an email invite", and the unlimited-vacations plan phrase.
- `scripts/vacation-app-reply-rules.mjs:622` — a later swim with no weekday must be said as saved on the second Friday.
- `scripts/vacation-app-reply-rules.mjs:628` — the long dump must use the words "building the itinerary".
- `scripts/vacation-app-reply-rules.mjs:638` — the model must end with a `BEAT:` line of three to six words.
- `scripts/vacation-app-reply-rules.mjs:642` — `splitBeat` removes that `BEAT:` line from the visible reply. The code does not insert its own beat string.
- `src/vacation/live-app-turn.mjs:2187` — the long-intake holding prompt requires these sentences: "I am building the itinerary from that now", the collaborators sentence, the view-access sentence, the edit-access sentence, and the unlimited-vacations plan sentence.
- `src/vacation/seat-price.mjs:31` — `payerPriceLine` builds `Name $dollars, paid by payer` from the customer turn. The reply prompts at `scripts/vacation-app-reply-rules.mjs:597` and `src/vacation/live-app-turn.mjs:2190` tell the model to state that line exactly.

Change line:

- `src/vacation/live-app-turn.mjs:914` — `rewriteCreditLabel` formats `Rewriter (model):` plus a change line it was given. It does not write the sentence.
- `src/vacation/live-app-turn.mjs:920` — `splitRewriteChange` reads a model `WHAT_I_CHANGED:` line and does not invent one when it is missing.
- `src/vacation/live-app-turn.mjs:934` — `verifiedRewriteChange` keeps or drops that stored line. It does not replace a dropped line with a new sentence.
- `scripts/live-transcript-dialog-pdf.mjs:765` — `shippedRewriteLabel` prints the stored `rewriterChange` only when the turn was rewritten and not held. It does not read `WHAT_I_CHANGED` from the reply body.

Not inserted into the customer reply:

- `src/vacation/live-app-turn.mjs:40` — `CANNED_APP_REPLY` (`Got it. I saved that`) is a string the ship path rejects. The code does not send it.
- `scripts/vacation-app-reply-rules.mjs:655` — `JEV_QUALITY_COMMENTS` are judge comments. The shipped log sets `jevNote` to null.

Canned outbound mail, outside the chat bubble:

- `src/vacation/email.mjs:24` — purchase email subject and body: "Your TimeSyncher Vacation purchase is confirmed" plus the open link.
- `src/vacation/email.mjs:53` — collaborator invite, including the view-access and edit-access sentences.
- `src/vacation/email.mjs:93` — web-editor invite: "approved you to edit" plus the magic-link paragraph.

## 4. Search environment variables

| Name | Where it is read | App reply / trip-fill path |
| --- | --- | --- |
| `BRAVE_SEARCH_API_KEY` | `scripts/vacation-public-research-worker.mjs:428` | Research worker only. Passed into `searchPois` as `braveKey`. |
| `BRAVE_API_KEY` | `scripts/vacation-public-research-worker.mjs:428` | Same line, fallback if `BRAVE_SEARCH_API_KEY` is empty. Research worker only. |
| Foursquare | none | `src/vacation/poi-search.mjs:89` filters records the caller passes in. No Foursquare env var. The worker passes `input.fsqRecords` at `scripts/vacation-public-research-worker.mjs:436`, which defaults to an empty array. |
| Overpass | none | `src/vacation/poi-search.mjs:189` posts to `https://overpass-api.de/api/interpreter`. No Overpass env var. Used only when `searchPois` runs. |

`src/vacation/poi-search.mjs` does not read `process.env` for Brave, Tavily, Foursquare, or Overpass. Brave runs only when `searchPois` is given a non-empty `braveKey` and the Foursquare-plus-Overpass list is thinner than 3 (`src/vacation/poi-search.mjs:156`).

Tavily: no match for `tavily` or `TAVILY` in this repository. There is no Tavily client.
