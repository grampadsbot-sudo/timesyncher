# Search redesign

Canonical inventory: `features/search-redesign.md`. GBrain Feature Map is the source. This file is the verification recipe.

There is no customer search screen. Do not invent one. Proof is the place-search module: OpenStreetMap and Brave still run.

## Sub-features

- Google Places and the Wanderlust GOAT Places seed are gone.
- Place search uses the prior database, OpenStreetMap, and Brave. Radius is measured from the house or lodging. Groceries 8 km, restaurants 10 km, stores 10 km, gardens and activities 40 km.
- There is no customer search screen. Proof is the place-search module, not a guest control.
- Jev scores web results in parallel. Keep score 3 or higher. Synthesis cites result POI ids only.
- Flights: ask the preferred airline before filtering. A named airline shows that airline. No preference shows at most one option per airline.
- Rental cars: the 10 lowest prices, no brand limit. The customer can eliminate brands afterward.
- Wind backup uses NWS, then Open-Meteo, for the trip location and dates.
- Intake screenshot classification uses `google/gemini-2.5-flash-lite`. No `gpt-*-mini` call.
- Live tabs are not padded with Las Vegas names or coordinates.

## How to get to it (user POV)

- No guest click. Confirm `src/vacation/place-search.mjs` queries OpenStreetMap and Brave.

## Driving it

- Staging alias `https://vacation-staging.timesyncher.com`.
- Doctor first: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor`.
- Screenshot `verify-search-redesign.png`.
- Pass when place search queries OpenStreetMap and Brave. Screenshot the shared itinerary; it has no search control.
- If place search drops OSM or Brave, the result is a product gap. Do not delete or soften this file.

## Gotchas

- A screenshot of the deleted card shell is a fail, not a pass.
- Reference trip for the TREK UI is `las-vegas-vacation-3`. The intake trip is `/shared/intake-eab1cbb15144/` when the proof is the Big Island itinerary.
