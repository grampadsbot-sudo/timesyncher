# Search redesign

SoT: `bot-admin/messages/time-syncher/search-redesign-no-google-20260926`

Research rule. Not a new customer control. Do not invent a search screen.

## Places

- Google Places is removed. The Wanderlust GOAT Places seed is disabled and does not run.
- Places come from a Foursquare OS Places record set plus OpenStreetMap. Radius is measured from the customer's house or lodging.
- Radius: groceries 8 km, restaurants 10 km, stores 10 km, gardens and activities 40 km.
- Brave Search runs only when that database returns fewer than 3 places. Brave ids are not stored in the 7-day cache.
- Cache key is category, geohash-6, radius, and date bucket. Database records cache for 7 days. Weather caches for 3 hours.
- Jev scores web results in parallel and keeps a score of 3 or higher. Structured database records are not scored one by one.
- A reply may cite only POI ids that were in the results. Generic names such as Kona, Big Island, Hawaii, Car Rentals, and Oahu are not places.

## Flights

Ask which airline the customer prefers before filtering. A named airline shows that airline's options. No preference shows at most one option per airline. No answer yet returns the question and no options.

## Rental cars

Return the 10 lowest prices with no brand limit. The customer can eliminate brands afterward.

## Wind

Swim backup copy uses NWS, then Open-Meteo, for the trip location and dates. A missing forecast does not invent a house-pool sentence.

## Intake classifier

Trip intake uses OpenRouter Jev decisions (`typesafe/jev-1.13` by default) for the trip_intake gate, then structured extraction on bake-off tier 1 from `dialog-runners/tier_models.json` (`deepseek/deepseek-v4-flash`). A `gpt-*-mini` model is not called.

## Live tabs

Live restaurant, store, and rest rows are real results for the trip. They are not padded with Las Vegas names or coordinates.

## Thing dossier discovery

Decision #66: `bot-admin/messages/time-syncher/eggbot-bot-primary-search-ruling-20261027`.
`gatherThingEvidence` uses VK Search bot `aa90bc69-c4eb-4237-a2f9-bcd76cd14dce` first.
An optional host HTTP bridge (`VK_SEARCH_WAKE_URL`) receives one POST with `{ botId, place }`;
otherwise the adapter reads `scripts/fixtures/vk-search-census/results/{id}.json`.
`VK_SEARCH_CENSUS_DIR` overrides the results directory; `VK_SEARCH_BOT_PRIMARY=0` restores the existing discovery path.
Empty/thin discovery falls back to the existing Brave/Tavily path. Discovery pages with failed
claim support are retained with `claim_support_failed`; their itinerary note is omitted.
Only claims citing URLs in the bot's sources become dossier fields. The existing stored-dossier
overlay supplies ratings, review counts, hours, happy-hour details and supported notes to Things.
Text price hints stay in the dossier and do not become numeric prices. No render path changes.
Local contract/overlay check: `node scripts/test_dossier_vk_search_adapter.mjs`.
Preview screen and PDF verification remains with the host publication pipeline; this entry does not certify it.
