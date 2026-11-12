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

Flights, Hotels and Cars list rows use the approved v3 name/logo and one-line price header, followed by gold (`#F59E0B`) rating stars on the left and a one-line date range on the right. Ranges use trip-relative days, including zero, negative and after-trip days; same-day endpoints state the day once. Flights include Depart/Arrive times and stored or route-derived timezone abbreviations; hotels show Check-in/Check-out and keep the existing nightly price; cars show Pickup/Drop-off. Thing view/edit is separate. Authority: GBrain `bot-admin/decisions/vk-list-dates-20261112`, issue #968. Acceptance: `acceptance/968.json` in the host dispatcher, iPhone WebKit touch at 390 and 430; local checks do not certify the published head.
