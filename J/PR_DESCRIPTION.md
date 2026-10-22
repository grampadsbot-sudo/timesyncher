Closes #608

## Summary

- Replaced semicolon-style ccab hotel blurbs in `scripts/fixtures/nyc_ccab_place_enrichment.json` with 40–120 word prose that names each property and keeps `summarySourceUrls` on the hotel website.
- Aligned the Motto overlay in `scripts/fixtures/pr336-gate-b-ccab-overlay.json` and regenerated `scripts/fixtures/pr336-vk-search-places.snapshot.json` so offline NYC shared-trip serving (`buildNycCraigKimDaybydayTrip`) picks up the same copy.
- Updated `scripts/test_vk_hotel_detail_fill.mjs` to assert fixture-backed hotels pass `descriptionPassesDetailJudge` without web enrichment (Hotel Edison list row).

List-tab rows from `nyc-vk-list-tab-rows.mjs` were already on this branch at `fb95a63`; this change fills description/price data those rows consume.

## Local verification

```bash
node --input-type=module -e "
import { buildNycCraigKimDaybydayTrip } from './scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { descriptionPassesDetailJudge } from './src/vacation/thing-detail-fields.mjs';
const trip = buildNycCraigKimDaybydayTrip();
const o = trip.thingOverrides || {};
const hotels = trip.places.filter(p => (o['place:'+p.id]||{}).category === 'hotel');
const pass = hotels.filter(h => descriptionPassesDetailJudge((o['place:'+h.id]||{}).longDetails || h.description, h.name));
console.log({ hotels: hotels.length, hotel_desc_pass: pass.length, flights: trip.places.filter(p=>(o['place:'+p.id]||{}).category==='flight').length, cars: trip.places.filter(p=>(o['place:'+p.id]||{}).category==='car').length });
"
# hotel_desc_pass 22 / hotels 22; flights 16; cars 1; missing prices 0

node scripts/test_gate_b_product_row_fields.mjs
node scripts/test_nyc_budget_search_fill_prices.mjs
node scripts/test_vk_hotel_detail_fill.mjs
node scripts/regenerate_pr336_search_trip_fixture.mjs
```

Pre-DONE gate (lane): `check-no-comments`, `test_offline_manifest`, `BASE=codex/ruling95-consolidated-logo check-code-ratchet` — all exit 0 on commit tip.

## Out of scope (left alone)

- Gate B pixel compare and `live_accept.py` on staging (host/CI after publish).
- UI/renderer changes; timeline rows 601–611 unchanged in `nyc-craig-kim-daybyday-rows.mjs`.
