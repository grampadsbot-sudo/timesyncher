# TimeSyncher Vacation Feature Map

Inventory of **live UI** on 2026-09-10. Do **not** invent controls.

- Host: `https://travel.timesyncher.com/shared/las-vegas-vacation-3/`
- Bundle: `/assets/index-BKun7ofk.js`
- Completeness rule: `bot-admin/messages/time-syncher/feature-map-full-ui-inventory-rule-20260910`
- Config dump (stamp, do not invent): `bot-admin/messages/time-syncher/keepsakes-config-defaults-20260910`
- Skill: `skills/feature-map-full-ui-inventory`
- Skills index: `features/skills-alignment.md`
- Budget QA: `bot-admin/messages/time-syncher/keepsake-qa-budget-rules-20260910`
- Config-ON PDF proof: `features/config-on-style-two-proof.md`
- Initial fill (per-category **15 / 10 / 15**, not total-8): `features/min-things.md` / `bot-admin/messages/time-syncher/initial-min-things-rule-20260910`
- Autonomy bar: `features/autonomous-app-customer-flow.md` / `bot-admin/messages/time-syncher/autonomous-app-customer-flow-20260910`
- TG intake track + build cue: `features/tg-intake.md` / `bot-admin/messages/time-syncher/tg-intake-gbrain-track-and-build-cue-20260910`
- Style-2 **sole SoT:** `bot-admin/messages/time-syncher/style-2-journey-book-standard` (CoS dated twin = same rules)

A live control missing from `features/` means the map is incomplete — do not claim verified. This map is **not** a verify-PASS. Hold certify. Skillify jobs 18–22 in flight.

## Style-2 product path (sole SoT)

Layouts: **style-1 / Style one** and **style-2 / Style two** only. Export = clicking **Layout 2 / Style two**, then PDF. Do not invent a third.

1. Open `https://travel.timesyncher.com/shared/las-vegas-vacation-3/`
2. **PDFs** → **Keepsakes ▸** → **Style two** (Layout 2)
3. PDF: `/api/pdf/shared/las-vegas-vacation-3/report/keepsake-style-2.pdf`
4. HTML preview: `?printMode=report&pdfReport=keepsake-style-2`

Staging mirrors:

- `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/journey?style=2`
- `https://vacation-staging.timesyncher.com/api/pdf/shared/las-vegas-vacation-3/report/style-2`

Style one is `report/keepsake.pdf`.

## Keepsakes Config defaults (CoS live dump — stamp)

**UI path:** PDFs → Keepsakes → Admin/Config

**Defaults ALL ON** as of live dump. Source: `bot-admin/messages/time-syncher/keepsakes-config-defaults-20260910`.

| Option | Default |
| --- | --- |
| logo | ON |
| Initial summary page | ON |
| Event summary | ON |
| Saved stories | ON |
| Restaurants | ON |
| Shows/Tours/Rest | ON |
| Stores | ON |
| Day1 map | ON |
| Day2 map | ON |
| Day3 map | ON |

**Not in Config:** no media toggle, no QR toggle (video QR is a product content rule, not a Config switch).

Live TREK button labels for the same panel (not extra options): **TimeSyncher Vacation logo**; **Shows, Tours and the Rest**; heading **Daily maps** with **Day {n} map**. Menu chrome: **Keepsakes ▸** → **Admin ▸**. Storage: `thingOverrides.__keepsakePrintSettings`. Query params only when **off**.

## Inventory (every other live UI feature)

| Surface | Live label / control | Feature file |
| --- | --- | --- |
| Header brand | TimeSyncher Vacation | `header-chrome.md` |
| Language | Change language / Select language | `language.md` |
| Trip view | **Config Options** → **Trip View** → Flights / Hotels / Cars (default ON) | `config-options-trip-view.md` |
| Print menu | **PDFs** → menu title **Print / PDF** | `print-pdf.md` |
| Daily PDF | Daily printout ▸ → Day N | `print-pdf.md` |
| Keepsake layouts | Keepsakes ▸ → **Style one** / **Style two** | `layouts.md` |
| Keepsake config | Keepsakes ▸ → **Admin ▸** | `keepsakes-config.md` |
| List PDFs | Restaurants / Stores / The Rest / Complete List | `print-pdf.md` |
| Order | **Order Keepsakes** | `order-keepsakes.md` |
| Tabs (shared) | Day-by-Day, Flights, Hotels, Cars, Restaurants, Stores, The Rest, Budget (Budget when `share_budget`) | `itinerary-surfaces.md` |
| Flag tabs | Packing when `share_packing`; Chat when `share_collab` | `packing.md`, `collaborators.md` |
| Day view | Vacation Day View, Day 1/2/3, timeline, day map copy | `day-view.md` |
| Map | “Only things tagged for this day + Timeline appear on the map below.” | `maps.md` |
| Filters | All areas / All types | `filters.md` |
| Empty states | No restaurants/stores match those tags; no timeline-tagged things | `empty-states.md` |
| Detail | Detail page, Detail name, Days, Timeline, Status, Type, Area, Start, Duration | `detail-page.md` |
| Status | considering / preferred / reservation / booked / eliminated | `status.md` |
| Happy hour | Happy hour + Happy hour details | `happy-hour.md` |
| Hotel fields | Stay days, Check-in/out date/time | `hotel-stay-fields.md` |
| Flight fields | Takeoff, Connections, Layover | `flight-fields.md` |
| Car fields | Rental company, Car type | `car-fields.md` |
| Ratings | Rating / Yelp rating / Other rating | `ratings-reviews.md` |
| Reviews | 5-star review quote 1–3; print `★★★★★` | `ratings-reviews.md` |
| Stories / media | Saved stories (Config); Edit caption; Play video | `media-stories.md` |
| Collab | Checking edit access… / Saved to itinerary / View-only — editing requires an approved email invite | `collaborators.md` |
| Budget | Tab when `share_budget`; which things appear = live TREK rules only | `budget.md` |
| Min things | Initial website fill **15 restaurants / 10 stores / 15 The Rest** (not total-8) | `min-things.md` |
| Autonomy bar | Telegram customer flow → GBrain + code + website; no bot-babysit | `autonomous-app-customer-flow.md` |
| TG intake | Track Q&A in GBrain; 10–15 min build cue; then autonomous fill | `tg-intake.md` |
| Settings (TREK, not shared-guest header) | Mapbox / Google Maps / Weather / Invite / Copy link | `trek-settings.md` |
| Nav chrome (TREK bundle) | Open/Close navigation; Move up/down | `navigation.md` |

Not found on shared vacation-3 header in this dump: voice-note recorder, media toggle, QR toggle.
