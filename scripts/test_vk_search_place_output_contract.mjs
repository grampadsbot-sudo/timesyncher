#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  assertSearchPlaceOutputContract,
  finalizeSearchPlaces,
  searchPlaceOutputViolations,
} from '../src/vacation/search-place-output.mjs';
import {
  assertGateBRowProvenance,
  buildPr336VkSearchPlacesByRowId,
  buildVkSearchContractSamplePlaces,
} from './fixtures/pr336-vk-search-trip-sources.mjs';

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

const negativeZeroPrice = searchPlaceOutputViolations({
  category: 'store',
  title: 'Sample store',
  summary: 'Distinct short summary for the itinerary line.',
  description: 'Long rating-driven description that is not copied from the summary and names what to buy.',
  price: 0,
  logoUrl: 'https://example.com/favicon.ico',
});
assert.deepEqual(
  negativeZeroPrice.includes('banned_price_zero'),
  true,
  'price 0 must fail the VK contract validator',
);

const negativeMissing = searchPlaceOutputViolations({
  category: 'hotel',
  title: 'Sample hotel',
  summary: 'Short pick line.',
  description: '',
  price: 120,
  logoUrl: 'https://example.com/favicon.ico',
});
assert.deepEqual(
  negativeMissing.includes('blank_description'),
  true,
  'blank description must fail',
);

assert.throws(
  () => finalizeSearchPlaces([{
    category: 'restaurant',
    title: 'Bad row',
    summary: 'Short summary.',
    description: 'Long enough description with price context.',
    price: 0,
    logoUrl: 'https://example.com/favicon.ico',
  }]),
  /search place output contract failed/,
  'finalizeSearchPlaces must enforce the contract',
);

assertSearchPlaceOutputContract(buildVkSearchContractSamplePlaces());

const gateBPlaces = buildPr336VkSearchPlacesByRowId(GATE_B_ROWS);
assertGateBRowProvenance(GATE_B_ROWS, gateBPlaces);
assertSearchPlaceOutputContract(GATE_B_ROWS.map((row) => gateBPlaces[row.id]));

console.log('vk search place output contract tests passed');
