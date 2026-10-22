Closes #608

## Summary

- Replace generic/meta hotel descriptions for **Midtown sample hotel**, **Arthouse Hotel**, and **The Empire Hotel New York** in the NYC ccab enrichment fixture (`nyc_ccab_place_enrichment.json`) with address-specific prose grounded in each property’s real location, amenities, and typical Booking.com praise/complaints.
- Regenerate `pr336-vk-search-places.snapshot.json` so the offline-approved NYC shared trip (`buildGateBApprovedSharedTrip`) serves the updated copy on staging without a DB refill.

## Checks (local, tip `f8b9dd03`)

- `node scripts/regenerate_pr336_search_trip_fixture.mjs`
- `node /home/ubishere9995/tsv-dispatch/live_accept_eval.mjs` on built shared trip: 22/22 hotels pass the 30-word detail judge; all hotels/flights/cars priced
- `node scripts/test_nyc_budget_search_fill_prices.mjs`, `node scripts/test_vk_hotel_detail_fill.mjs`, `node scripts/test_gate_b_product_row_fields.mjs`, `npm run test:keepsake-style2`
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`

## Left alone (scope)

- Baselines, Gate B/capture scripts, workflows, dependencies, timeline rows 601–611 layout, `nyc-craig-kim-daybyday-positive-v1.mjs` (not the served staging path).

## Post-deploy

- `~/tsv-dispatch/live_accept.py` should report `hotel_desc` 22/22 on live staging.
