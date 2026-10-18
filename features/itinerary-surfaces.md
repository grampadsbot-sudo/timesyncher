# Itinerary surfaces (tabs)

Shared vacation-3 tabs when `dn` (shared view), from live bundle:

| Tab | Icon | Gate |
| --- | --- | --- |
| Day-by-Day | 📅 | always |
| Flights | ✈️ | Config Options Flights ON |
| Hotels | 🛏️ | Config Options Hotels ON |
| Cars | 🚗 | Config Options Cars ON |
| Restaurants | 🍽️ | always |
| Stores | 🛍️ | always |
| The Rest | 🎟️ | always (`id: events`) |
| Budget | 💵 | `share_budget` |

Flag-gated extra tabs in the same renderer: Packing (`share_packing`), Chat (`share_collab`).

## React preview lists — #336 piece A

`vacation-app-next.html` prepares fetched shared payloads through the existing synchronous `finalizeServedSharedTripPayload` pipeline; presentation does not discover or fetch more source data. The served `/shared/` and product print routes remain on TREK.

Category lists initially sort by ascending price, with missing prices last. The existing Name/Price buttons expose the active sort and keep their keyboard behavior. Flight row display names omit a stored **Flight option:** prefix. Prices may come from stored price/total/ticket fields or explicit dollar amounts in source text; unpriced events show no price. List row identity, missing-description and sourced-summary hooks are present without changing logo or row-name frames.

Descriptions use fetched website text, review themes and usable stored text. Category sales templates and repeated name fragments stay blank. Opaque rental summaries/subtitles stay blank when sourced price, pickup/return locations or operating hours are missing; no return/dropoff facts are inferred. Short source text is never expanded to meet a word count.

Coverage: `test/{prepareServedTrip,listRows,presentation}.unit.mjs` and `scripts/test_tsv397_integrity_audit.mjs`. No shared-route rollout or UI acceptance follows from this source port.
