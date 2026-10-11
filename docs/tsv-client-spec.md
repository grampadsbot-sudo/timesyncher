# TSV vacation client spec (P1 — clean-room rewrite target)

This document describes the **shared vacation website** (itinerary at `/shared/{slug}`) that today is rendered by a patched upstream TREK bundle. P1 does **not** cut over traffic; it defines behaviour the new React client must match and lists sources used to derive it.

## Global rules (owner R1–R8)

These apply to **every screen** and **every thing category** in the new client.

| Rule | Requirement |
| --- | --- |
| **R1 Centring** | Every logo and icon is vertically centred: tab icons in their pills, list logos with the thing name, timeline icons with the item name. Tolerance **0.5 px** on rendered pixels. |
| **R2 Budget completeness** | Every thing on any itinerary day appears in the budget list. An empty budget is always a fail. |
| **R3 Real logo** | Each thing shows its own logo (brand/favicon, airline, rental company, or place photo)—never a shared placeholder across unrelated things. |
| **R4 Price** | Price on each row when known; Price sort sorts by numeric price. Hotels: per-night in list, stay total in Budget. |
| **R5 Description quality** | Descriptions explain why people rate the thing as they do, with specific facts, **≥ 30 words**, not generic and not duplicated boilerplate across rows. Category-specific facts per issue #300 (restaurant, flight, hotel, car, store, events). |
| **R6 Row layout** | `[logo centred with name] · name · price · description` on one line; desktop description fills the rest of the row; at **390px** description may wrap. Supersedes older two-line-only rows. |
| **R7 No lost features** | Nothing in staging today may be dropped: header controls (admin, keepsakes, etc.), list contents (rental cars), approved short hotel notes, audio note UI, print/journey entry points, collaborator/edit affordances where permitted. |
| **R8 Map order** | On **Day-by-Day**, the map is **below** the day timeline/itinerary block. |

### Detail and review rules (thing detail & summaries)

- Every thing shows: coordinates, address, phone, hours, website, price or price level, ratings with counts, real logo/photo, itinerary note.
- Restaurants/bars: happy hour (days, times, deals).
- Every type except flights and cars: **4 reviews**, each with star rating, **≥ 25 words** full text, source (Google, Yelp, or TripAdvisor), rendered in review boxes.
- Summary **≥ 30 words**, specific (quality, price, reputation, key products/dishes, appeal), from web/articles/social plus reviews; stores keep **≥ 2 source URLs** beyond reviews.
- Flights: airline, flight number, times, layovers, duration, price.
- Cars: company, class, pickup/return, price.

---

## Sources (required — all seven cited)

| # | Source | How used in this spec |
| --- | --- | --- |
| 1 | **Staging behaviour** | [vacation-staging.timesyncher.com](https://vacation-staging.timesyncher.com) shared trips; verify skill `features/screens/app.md` for owner app shell; tab order and overflow behaviour from `scripts/test_pr225_served_tabs_overflow.mjs`. |
| 2 | **Approved NYC baselines (read-only)** | Pixel references under `scripts/fixtures/nyc-final-reference/` (`hotels`, `restaurants`, `stores`, `cars`, `flights`, `events`, `budget`, `day-by-day` at 390×844 and 1280×800 framing). Gate: `scripts/test_pr225_area_chips_layout_gate.mjs`. |
| 3 | **Needle-patch inventory** | Plain-English summary in [Needle modules](#needle-modules-srcvacationtrek-mjs) below; implementation in `src/vacation/trek-*.mjs`. |
| 4 | **Gate B named checks** | [Gate B checks](#gate-b-named-checks) below (CI + staging smoke). |
| 5 | **Owner rules R1–R8** | [Global rules](#global-rules-owner-r1r8) above. |
| 6 | **Detail and review rules** | [Detail and review rules](#detail-and-review-rules-thing-detail--summaries) above; enforced in data via `src/vacation/thing-detail-fields.mjs` and `gate-b-thing-detail-completeness.mjs`. |
| 7 | **API routes & DB** | [API & database](#api-routes-and-database) below; handlers in `api/[...route].mjs` → `routes/vacation-itinerary.mjs` / `src/vacation/shared-trip-handler.mjs`; schema in `db/migrations/001_vacation_mvp.sql` and follow-ons. |

---

## API routes and database

### HTTP routes the shared **read-only** client uses (P1)

| Method | Route | Handler | Purpose |
| --- | --- | --- | --- |
| GET | `/api/shared/{shareToken}/` | `shared-trip-handler` | **Primary boot payload**: trip, `places`, `days`, `assignments`, `thingOverrides`, `budget`, `permissions`, `forecast`, presentation fields. Same JSON `shared-app.html` validates before loading TREK. |
| GET | `/api/shared/{shareToken}/edit-access` | `shared-trip-handler` | Intake slug edit capability probe (`{ canEdit }`). |
| GET | `/api/shared-trip/{shareToken}` | `shared-trip-handler` | Alternate entry path (same handler family). |
| GET | `/api/version` | `version` | Build SHA / health (optional for preview stamp). |

Published slugs may proxy to upstream TREK when `TIMESYNCHER_TREK_PUBLIC_BASE_URL` is set; offline approved NYC slug is served locally (`GATE_B_APPROVED_SHARED_SLUG` in `scripts/fixtures/gate-b-approved-shared-trip.mjs`). The new client consumes **TimeSyncher JSON shape** from `intakeSharedResponse` / `finalizeServedSharedTripPayload`, not upstream TREK wire format.

### Tables and columns (client-relevant)

| Table | Client use |
| --- | --- |
| `trips` | `title`, `destination`, `start_date`, `end_date`, `metadata` (`publicSlug`, `intakeShare`, budget targets), `status`. |
| `trip_things` | Rows → `places` via `thingRecordFromTripRow` / `sharedTripFromIntake`: `category`, `title`, `description`, `location`, `ratings`, `metadata` (pricing, logos, scheduling, thing detail). |
| `budget_items` | Legacy/alternate budget storage; live tab budget lines often derived in `shared-trip-api-budget.mjs` into `shared.budget`. |
| `thing_media_bindings` (`002_thing_media_bindings.sql`) | Bound media URLs on things (`/ts-thing-media/...`). |
| `vacation_web_access_grants` | Edit permissions for website (future write paths; P1 read-only). |
| `customers`, `entitlements`, `transcript_turns` | Owner **vacation app** chat shell only—not loaded by shared trip read path in P1. |

---

## Gate B named checks

Gate B is **CI + Ubuntu pixel diff** against Craig's NYC baselines (no model) plus offline assertions on the approved shared-trip fixture.

| Check | Asserts |
| --- | --- |
| **PR225 layout (a)+(b)+(c)** | `scripts/test_pr225_area_chips_layout_gate.mjs`: Hotels, Restaurants, Stores, Events chip rows pixel-match `scripts/fixtures/nyc-final-reference/*` within ratio; exact chip labels at 390/1280. |
| **PR225 tabs overflow** | `scripts/test_pr225_served_tabs_overflow.mjs`: `scrollWidth ≤ viewport` on every tab at 390; mobile inactive tabs icon-only. |
| **PR225 Cars overflow** | `scripts/test_pr225_cars_tab_overflow.mjs`: Cars timeline checkbox not clipped at 390/1280. |
| **Shared trip horizontal overflow** | `scripts/test_shared_trip_no_horizontal_overflow.mjs`: all eight tabs at 390 and 1280. |
| **BUD (budget API vs DOM)** | `scripts/test_shared_trip_api_budget_lines.mjs`: scraped budget tab amounts match `shared.budget` API lines; no hardcoded dollar leaks (`shepherd-staging-smoke-map-lib.mjs`). |
| **LOGO / live tab logos** | `scripts/test_gate_b_live_tab_logo_rows.mjs`, `scripts/test_shared_trip_live_tab_logos.mjs`: hotel/car rows, `data-ts-logo-chip`, real logo URLs offline on fixture. |
| **THING-CARD** | Staging smoke (`shepherd-staging-smoke-map-logo-run.mjs`): sort buttons, ≥2 rows, logo ink present on thing cards. |
| **Product row / detail completeness** | `scripts/test_gate_b_product_row_fields.mjs`: `gateBThingDetailCompleteness`, detail capture payload, car/hotel row fields on NYC fixture. |
| **Logo/tab centring (bundle markers)** | `scripts/test_shared_logo_chip_center_bundle.mjs`, `scripts/test_shared_category_tab_icon_center_bundle.mjs`: R1 markers in served bundle. |
| **Gate B residuals 6 / 6b / D** | `scripts/test_gate_b_6_6b_d_fbb8a79.mjs`, `scripts/test_gate_b_266_place_search_reply.mjs`: chat/search behaviours (backend; client must not break trip JSON). |
| **Gate B H / INV-CLAIM** | `scripts/test_inv_claim_hyatt_gap_reply_route.mjs`: lodging intake path (backend). |
| **Gate B R (area scope)** | `scripts/test_kihei_coffee_area_scope.mjs`, `scripts/test_kihei_coffee_h502_lodging_path.mjs`: geo-scoped replies (backend). |
| **Staging fail-closed GO** | `SMOKE_FAIL_CLOSED_GO` in `scripts/shepherd-staging-smoke-plan.mjs`: `5`, `D`, `R`, `INV-CLAIM`, `MAP`, `BUD`, `LOGO`, `THING-CARD`, `LAYOUT`, `VISUAL`, `EULA`. |

Screens below list which Gate B rows apply visually.

---

## Needle modules (`src/vacation/trek-*.mjs`)

Plain-English inventory of what each module patches in the **served bundle** today:

| Module | What it does today |
| --- | --- |
| `trek-style2-bundle.mjs` | Orchestrates strip of canned/demo content, style-2 keepsake print layout, saved-story media bytes, list row logo chips, day timeline summaries, QR/media URLs, removes TREK callers to `/system-notices` and `/auth/app-config`; produces `public/assets/index-BKun7ofk.js`. |
| `trek-live-product-patches.mjs` | Live shared trip: real list rows (hotels/cars/restaurants/stores/events), removes “coming soon” cars placeholder, budget includes Cars bucket, flight row price grid, car timeline checkboxes and pickup/dropoff on day view, tab breakpoint, hostname allowlist for harness, map initial view hook, thing detail bundle hooks, footer copy, MCP string cleanup. |
| `trek-shared-layout-patches.mjs` | Prevents horizontal overflow on shared tabs and list rows (clip/wrap/grid tweaks). |
| `trek-day-by-day-map-patches.mjs` | Day map uses OpenTopo/OSM tile host; keeps Leaflet day map markers for Gate B; keepsake map pages. |
| `trek-default-map-tiles.mjs` | Static map tile host constant for patched `xa()` maps. |
| `trek-budget-target-patches.mjs` | Budget tab shows only saved `thingOverrides.__budgetTargets` / API-synced lines—not fake expense defaults. |
| `trek-thing-detail-patches.mjs` | Thing detail side panel: fields, ratings, live product detail wiring. |
| `trek-thing-detail-fields-patch.mjs` | Injects address, hours, phone, website, reviews, happy hour, summary sources into detail UI. |
| `trek-thing-detail-capture-patch.mjs` | Scoped `tsDetailCapturePayload` for layout capture / completeness tests. |
| `trek-thing-detail-ratings-patch.mjs` | Ratings display fixes in detail panel. |

Related non-`trek-*` needles the client must replace: `shared-trip-oe-list-row-patch.mjs` (HTML list row markers for Gate B), `shared-trip-live-tab-lists.mjs` (server-side row HTML for hotels/cars tabs).

---

## Screen catalogue

Shared trip **primary navigation tabs** (staging + PR225 harness): **Day-by-Day**, **Flights**, **Hotels**, **Cars**, **Restaurants**, **Stores**, **The Rest**, **Budget**. Additional surfaces: **thing detail** (modal/panel), **header** (admin/config, keepsakes/journey, print), **journey/keepsake** report (linked from header; print/PDF path uses same data model).

Viewport specs reference **390px** width (mobile) and **1280px** (desktop) per Gate B captures.

---

### 1. Trip shell (header, tab bar, footer)

**Purpose:** Frame the itinerary: trip title, global actions, category navigation, build stamp on trip pages.

**Layout**

- **390px:** Top header with trip title truncation; horizontal scroll or wrapped **icon+label tab bar** (inactive tabs may be icon-only per PR225 overflow test); footer build stamp visible on trip pages (`shared-app.html` `data-ts-trip`).
- **1280px:** Same tabs with full labels; header controls visible (config/keepsakes/admin per permissions).

**Data:** `trip.title`, `permissions`, `metadata`; boot from `GET /api/shared/{token}/`.

**Actions:** Switch tabs; open config menu; open keepsake/journey; print menu; audio note controls when enabled (`shared-app.html` styles).

**Gate B:** PR225 overflow all tabs; LAYOUT/VISUAL smoke; horizontal overflow tests.

**Parity (R7):** Admin/config, keepsakes, print entry, audio note UI, embed mode (`data-ts-embed`) hiding stamp.

---

### 2. Day-by-Day

**Purpose:** Per-day timeline of assigned things, conflicts, travel rows, and day map.

**Layout**

- **390px:** Day selector or stacked day cards; timeline rail with icons (R1), titles linking to detail; conflict styling; **map section below timeline (R8)**.
- **1280px:** Wider timeline; map below itinerary column; photo popups must not clip (`data-ts-day-timeline`, `data-ts-pic-popup`).

**Data:** `days[]`, `assignments`, `places`, `thingOverrides` (times, timeline flags, summaries via `rr()`/`ha()` equivalents), `forecast` optional.

**Actions:** Open thing detail; toggle car-on-timeline (cars); media popups on timeline items.

**Gate B:** `day-by-day-390.png` / `day-by-day-1280.png`; MAP smoke; R8 ordering; timeline icon centring tests.

**Parity:** Day summaries under titles for non-travel rows; conflict labels; car pickup/dropoff rows; no horizontal clip on cars checkbox row.

---

### 3. Flights

**Purpose:** Catalog of flight things with airline logo, price, times.

**Layout**

- **390px:** Rows per R6; grid columns for airline, price (with one-way/round), depart, arrive; horizontal overflow forbidden.
- **1280px:** Same row semantics with more description width.

**Data:** `places` filtered to flight category; overrides for price, times, airline logo.

**Actions:** Sort (including Price); open detail.

**Gate B:** `flights-390/1280` baselines; tab overflow harness.

**Parity:** Price sort; fare direction label; airline logo (R3).

---

### 4. Hotels

**Purpose:** Lodging list with area chips, first-row note behaviour, per-night price.

**Layout**

- **390px:** Area chips (`All areas`, neighborhood chips from data); list rows with logo chip + name + price + description (R6).
- **1280px:** Chip row matches NYC baseline pixels (PR225 gate).

**Data:** Hotel `places`, `thingOverrides` (price/night, stay days, neighborhood, approved short note on first row when present in staging).

**Actions:** Area filter chips; sort; open detail.

**Gate B:** `hotels-390/1280`; PR225 chip text exact; LOGO rows.

**Parity:** Approved hotel note; per-night vs budget stay total (R4).

---

### 5. Cars

**Purpose:** Rental car comparison rows and timeline inclusion.

**Layout**

- **390px:** Rows: name, price, **Timeline** checkbox; grid `minmax(0,1fr) auto auto`; overflow clipped not scrolled.
- **1280px:** Same; checkbox fully inside viewport (PR225 Cars test).

**Data:** Car `places`, overrides (company, class, pickup/return, price).

**Actions:** Toggle timeline; open detail; sort by price.

**Gate B:** `cars-390/1280`; PR225 Cars overflow; live tab logo rows.

**Parity:** No “coming soon” placeholder; real car brands (R3).

---

### 6. Restaurants

**Purpose:** Dining list with area and type chips, tags, happy hour in detail.

**Layout**

- **390px / 1280px:** Area + type chip rows per baseline; list rows R6.

**Data:** Restaurant places, `restaurantTags`, happy hour fields, ratings.

**Actions:** Chip filters; sort; open detail.

**Gate B:** `restaurants-390/1280`; PR225 Restaurants chip gate.

**Parity:** Happy hour in detail (detail rules); 4 reviews in detail.

---

### 7. Stores

**Purpose:** Shopping / retail places.

**Layout:** Same chip + list pattern as Hotels/Restaurants baselines.

**Data:** Store category places, summaries, source URLs.

**Gate B:** `stores-390/1280`.

**Parity:** R5 store-specific copy; ≥2 summary source URLs.

---

### 8. The Rest (events)

**Purpose:** Events and non-restaurant/store catalog types (family event, tickets, bar, music, etc.).

**Layout:** Many type chips per `test_pr225_area_chips_layout_gate.mjs` CASES; list rows below.

**Data:** Event-category places, type metadata.

**Gate B:** `events-390/1280`; PR225 “The Rest” chip list.

**Parity:** Full chip vocabulary from staging.

---

### 9. Budget

**Purpose:** Trip spend breakdown by category and line items; must reflect every priced thing (R2).

**Layout**

- **390px / 1280px:** Category sections (Flights, Hotel, **Cars**, Restaurants, Stores, Other Things), trip total, line amounts matching API.

**Data:** `shared.budget[]` from `syncSharedTripApiBudget` / metadata targets; hotel stay totals.

**Actions:** View-only in P1.

**Gate B:** `budget-390/1280`; **BUD** API scrape test; empty budget fail (R2).

**Parity:** Cars bucket present; icons per category; no hardcoded amounts.

---

### 10. Thing detail (panel / modal)

**Purpose:** Full detail and reviews for a selected place.

**Layout**

- **390px:** Full-screen or sheet panel; review boxes stacked.
- **1280px:** Side panel or wide modal; row layout unchanged.

**Data:** Place + `thingOverrides[place:id]` merged detail fields (`thing-detail-fields.mjs`).

**Actions:** Close panel; external links (website, maps).

**Gate B:** `test_gate_b_product_row_fields.mjs` completeness; THING-CARD sort/detail smoke.

**Parity:** All [detail and review rules](#detail-and-review-rules-thing-detail--summaries); flights/cars abbreviated fields allowed.

---

### 11. Journey / keepsake (print report)

**Purpose:** Printable multi-page itinerary (style 1/2); linked from header; PDF/QR routes under `/api/pdf/` and `/shared/{slug}/journey`.

**Layout:** Print pages—not primary P1 scaffold target—but **must remain reachable** from shell (R7). Map order in print follows keepsake rules (day map pages).

**Data:** Same shared payload; print-specific rendering today lives in patched bundle (`trek-style2-bundle.mjs`).

**Gate B:** Keepsake/pdf journey tests in online suite; not pixel-Gate-B NYC tabs.

**Parity:** Order keepsakes link on journey path (`shared-app.html`); no separate cutover in P1.

---

### 12. Owner vacation app shell (chat + embedded site)

**Purpose:** Separate entry `vacation-app.html`—Grok-like composer, optional vacation dropdown (2+ trips), embedded shared site with splitter and full-screen control.

**Layout:** Spec in `features/screens/app.md` (390 / 1280); not built in `apps/vacation-client` P1 scaffold except as future phase.

**Data:** `/api/vacation-itinerary`, session cookies, trip list—not `/api/shared/` boot alone.

**Gate B:** `scripts/test_verify_vacation_layout_self_check.mjs`, `test_served_page_layout.mjs` (online).

**Parity:** R7 header hidden for 0–1 vacations; send button; full-screen website control—tracked for later TSV phases.

---

## P1 scaffold mapping (`apps/vacation-client`)

| Spec screen | Scaffold component |
| --- | --- |
| Trip shell | `TripShell`, `TabNav` |
| Day-by-Day | `DayByDayScreen`, `DayMap` |
| Category tabs | `CategoryTabScreen` (flights, hotels, cars, restaurants, stores, events) |
| Budget | `BudgetScreen` |
| Thing detail | `ThingDetailPanel` |
| Journey/keepsake | Not implemented in P1 (listed for parity tracking) |

Preview entry: `vacation-app-next.html` (not linked from production shell). Loads `GET /api/shared/{token}/` using `?token=` query parameter.

---

## Feature parity checklist (must not lose — R7)

- All eight tabs and chip filters visible on staging NYC trip.
- Cars tab with real rows and timeline toggles.
- Budget lines for hotels (stay total), cars, flights, activities.
- Header: config, print/keepsake/journey entry points.
- Thing detail from list and timeline.
- Audio note button styling/behaviour on shared trip pages.
- Short approved hotel note on first hotel row where staging shows it.
- Day-by-day map **below** itinerary (R8).
- Real logos and centred icons (R1, R3).

---

*Document version: P1 issue #300. Sources 1–7 cited in [Sources](#sources-required--all-seven-cited).*
