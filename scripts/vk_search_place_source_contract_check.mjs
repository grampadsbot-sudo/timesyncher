#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  assertSearchPlaceOutputContract,
  finalizeSearchPlaces,
  searchPlaceOutputViolations,
} from '../src/vacation/search-place-output.mjs';
import {
  assertVkSearchPlaceSourceContract,
  vkSearchPlaceSourceViolations,
} from '../src/vacation/vk-search-place-source-contract.mjs';
import {
  assertGateBRowProvenance,
  buildPr336VkSearchPlacesByRowId,
  gateBRowsForSearchPlaceOutputContract,
  GATE_B_INCOMPLETE_CONTRACT_ROW_IDS,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const GATE_B_ROWS = [
  { day: 1, time: '10:30', name: 'JetBlue LAS → JFK', cat: 'flight', id: 601 },
  { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602 },
  { day: 1, time: '16:00', name: 'Motto by Hilton New York City Times Square', cat: 'hotel', id: 603 },
  { day: 1, time: '19:00', name: 'Carbone', cat: 'restaurant', id: 610 },
  { day: 1, time: '20:30', name: 'Jazz at Lincoln Center', cat: 'activity', id: 611 },
  { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604 },
  { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605 },
  { day: 3, time: '14:00', name: 'Afternoon matinee show', cat: 'activity', id: 606 },
  { day: 3, time: '14:30', name: 'Friend meetup at Bryant Park', cat: 'activity', id: 607 },
  { day: 1, time: '11:00', name: 'Midtown sample hotel', cat: 'hotel', id: 608, listOnly: true },
  { day: 1, time: '11:00', name: 'Priceline opaque Toyota Corolla', cat: 'car', id: 609, listOnly: true },
];

assert.deepEqual(
  searchPlaceOutputViolations({
    category: 'store',
    title: 'Sample store',
    summary: 'Distinct short summary for the itinerary line.',
    description: 'Long rating-driven description that is not copied from the summary and names what to buy.',
    price: 0,
    logoUrl: 'https://example.com/favicon.ico',
  }).includes('banned_price_zero'),
  true,
  'price 0 must fail the VK contract validator',
);

assert.deepEqual(
  vkSearchPlaceSourceViolations({
    category: 'hotel',
    title: 'Sample hotel',
    externalId: 'Sample hotel',
    summary: 'Short pick line.',
    description: 'Rating: 4.2 on Booking.com with 100 reviews. Midtown base with subway access.',
    price: 120,
    logoUrl: 'https://example.com/favicon.ico',
    lat: null,
    lng: null,
    sourceRecord: {
      review1: 'Quiet rooms and easy subway access.',
      review1Source: 'Booking.com',
      review2: 'Staff handled a late check-in smoothly.',
      review2Source: 'Booking.com',
      review3: 'Good value for the neighborhood.',
      review3Source: 'Booking.com',
      thirdPartyRating: '4.2',
    },
  }).includes('missing_hotel_coordinates'),
  true,
  'hotel without coordinates must fail the VK source contract',
);

assert.deepEqual(
  vkSearchPlaceSourceViolations({
    category: 'store',
    title: 'Sample store',
    externalId: 'Sample store',
    summary: 'Short summary.',
    description: 'Long description with enough detail for the list row.',
    price: 12,
    logoUrl: 'https://example.com/favicon.ico',
    lat: 40.7,
    lng: -74.0,
    sourceRecord: { googleRating: '4.5' },
  }).includes('missing_sourced_reviews'),
  true,
  'missing three sourced reviews must fail',
);

assert.deepEqual(
  vkSearchPlaceSourceViolations({
    category: 'hotel',
    title: 'Midtown sample hotel',
    externalId: 'The Manhattan Club',
    summary: 'Neighborhood: Central Park / Midtown;',
    description: 'Neighborhood: Central Park / Midtown; Rating: 8.3 (4,345 Booking.com reviews); Price: $386/night;',
    price: 386,
    logoUrl: 'https://www.manhattanclub.com/favicon.ico',
    sourceRecord: {
      googleRating: '8.3',
      review1: 'Suite-style option with subway access.',
      review1Source: 'Booking.com',
      review2: 'Strong location near Central Park.',
      review2Source: 'Booking.com',
      review3: 'Good transit access for Midtown plans.',
      review3Source: 'Booking.com',
    },
    lat: 40.76,
    lng: -73.98,
  }).includes('identity_alias_blocker'),
  true,
  'row 608 Manhattan Club alias without proof must fail',
);

const badFinalized = finalizeSearchPlaces([{
  category: 'restaurant',
  title: 'Bad row',
  summary: 'Short summary.',
  description: 'Long enough description with price context.',
  price: 0,
  logoUrl: 'https://example.com/favicon.ico',
}]);
assert.throws(
  () => assertSearchPlaceOutputContract(badFinalized),
  /search place output contract failed/,
  'assertSearchPlaceOutputContract must reject banned zero price after enrichment',
);

const gateBPlaces = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
assertGateBRowProvenance(GATE_B_ROWS, gateBPlaces);

const row608Violations = vkSearchPlaceSourceViolations(
  { ...gateBPlaces[608], gateBRowId: 608 },
  { rowId: 608 },
);
assert.ok(row608Violations.length > 0, 'list-only row 608 must fail the VK source contract');

for (const row of gateBRowsForSearchPlaceOutputContract(GATE_B_ROWS)) {
  assertVkSearchPlaceSourceContract(
    [{ ...gateBPlaces[row.id], gateBRowId: row.id }],
    { rowId: row.id },
  );
}
assert.ok(
  GATE_B_INCOMPLETE_CONTRACT_ROW_IDS.has(608),
  'row 608 remains the incomplete Gate B source-contract row',
);

const dayByDayTrip = buildNycCraigKimDaybydayTrip();
const listHotel = dayByDayTrip.places.find((place) => place.id === 608);
const listHotelOverride = dayByDayTrip.thingOverrides['place:608'] || {};
assert.equal(listHotel?.lat, null, 'row 608 day-by-day place must not inherit invented coordinates');
assert.equal(listHotel?.lng, null, 'row 608 day-by-day place must not inherit invented coordinates');
assert.equal(listHotelOverride.price ?? null, null, 'row 608 must not carry invented nightly price on the Gate B trip');
assert.match(
  String(listHotelOverride.provenanceBlocker || listHotelOverride.summary || ''),
  /list-only Midtown hotel|List-only row/i,
  'row 608 must surface blocked provenance instead of borrowed hotel identity',
);

console.log('vk_search_place_source_contract_check: passed');
