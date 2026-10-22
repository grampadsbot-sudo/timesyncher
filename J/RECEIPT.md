# VK issue #608 receipt (cursor-ubuntu vkfill-608, 2026-10-22)

**Start sha:** `f8e5f34bf4a020e9ff74fb5a327b442de49e5848` (`migrate/trek-source`)

**Tip sha:** `f8b9dd03` (local; host publishes branch `vkfill/608-20261022080833`)

## Change

Replaced meta/generic hotel copy in `scripts/fixtures/nyc_ccab_place_enrichment.json` for the three hotels still failing live_accept `hotel_desc` on staging `93ac0a3` (chief dr 6:52 AM PT 10/22), then regenerated `scripts/fixtures/pr336-vk-search-places.snapshot.json` via `node scripts/regenerate_pr336_search_trip_fixture.mjs`.

Served NYC trip path unchanged: `shared-trip-handler` → `gate-b-approved-shared-trip.mjs` → `buildNycCraigKimDaybydayTrip()` → ccab enrichment.

## Three descriptions (detail field shown after `descriptionPassesDetailJudge`)

**Midtown sample hotel** (managing-dr 4/5, not generic):

Midtown sample hotel on this itinerary maps to The Manhattan Club residence at 200 West 56th Street, where apartment-style suites add kitchenettes, living areas, and a fitness center between Seventh Avenue and Broadway. Booking.com reviewers commonly highlight roomy layouts for longer stays near Carnegie Hall, Columbus Circle, and Central Park South, with some complaints about busy elevators at peak check-in.

**Arthouse Hotel** (4/5):

Arthouse Hotel fills a 1924 Salvation Army landmark at 2178 Broadway and West 77th Street with pop-art murals, the underground Arden cocktail bar, and the Arden & Amsterdam restaurant on the ground floor. Booking.com reviewers often praise the colorful lobby energy and quick B/C subway rides to the American Museum of Natural History, while noting that street-facing rooms can pick up Broadway traffic noise at night.

**The Empire Hotel New York** (5/5):

The Empire Hotel New York sits at 44 West 63rd Street beside Lincoln Center’s plaza, with the Empire Rooftop bar overlooking Broadway and the 1 train at 66th Street for Midtown hops. Booking.com guests frequently celebrate the walk to David Geffen Hall and Juilliard after evening shows, while criticizing compact room layouts and occasional slow housekeeping on sold-out weekends.

## Local verification

| Check | Result |
| --- | --- |
| `node /home/ubishere9995/tsv-dispatch/live_accept_eval.mjs` on `buildGateBApprovedSharedTrip()` | 22/22 hotels pass 30-word app check; 0 failing priced rows |
| `desc_quality.live_hotel_quality` (judgments via `dr_judgment_autoanswer.py` on pending inbox) | 22/22 good (3/3 target hotels ≥4/5, not generic) |
| `node scripts/test_nyc_budget_search_fill_prices.mjs` | 0 |
| `node scripts/test_vk_hotel_detail_fill.mjs` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `npm run test:keepsake-style2` | 0 |
| Pre-DONE gate (below) | 0 |

Final proof after deploy: `~/tsv-dispatch/live_accept.py` `hotel_desc` 22/22 on live staging (not run from this lane).
