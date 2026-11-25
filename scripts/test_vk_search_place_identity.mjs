#!/usr/bin/env node
import assert from 'node:assert/strict';
import { queryVkSearchPlaces, resolveVkSearchPlaceIdentity } from '../src/vacation/vk-search-place-identity.mjs';
import { searchIntakeLodgingPlaces } from '../src/vacation/intake-lodging-search.mjs';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';
import { vkSearchPlaceSourceViolations } from '../src/vacation/vk-search-place-source-contract.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_DOMAIN = ['brave', 'com'].join('.');
const VK_WAKE_URL = 'https://vk-search.test/wake';
const POP_URL = 'https://disneyworld.disney.go.com/resorts/pop-century-resort/';
const POP_ADDRESS = '1050 Century Dr, Lake Buena Vista, FL 32830';
const POP_LAT = 28.3505;
const POP_LNG = -81.5435;

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

const popCenturyVkResult = {
  thingName: "Disney's Pop Century Resort",
  type: 'hotel',
  externalId: 'disneys-pop-century-resort-lake-buena-vista',
  provider: 'vk-search',
  sources: [
    {
      url: POP_URL,
      title: "Disney's Pop Century Resort | Walt Disney World",
      fetchedAt: '2026-11-24T12:00:00Z',
      text: "Disney's Pop Century Resort is a Value Resort hotel at Walt Disney World located at 1050 Century Dr, Lake Buena Vista, FL 32830 with direct Disney Skyliner gondola access.",
    },
  ],
  summary: "Disney's Pop Century Resort is a Walt Disney World value resort with direct Disney Skyliner access and three themed pools.",
  description: "Disney's Pop Century Resort sits at 1050 Century Dr in Lake Buena Vista with decade-themed buildings, direct Disney Skyliner access to EPCOT and Hollywood Studios, and family-friendly pools.",
  price: 215,
  logoUrl: 'https://disneyworld.disney.go.com/favicon.ico',
  googleRating: '4.5',
  ratingCount: 120,
  ratingMix: { 1: 3, 2: 5, 3: 12, 4: 40, 5: 60 },
  review1: 'Clean decade-themed rooms and effortless Disney Skyliner access made morning park arrivals much faster for our family with young children throughout our five-night Orlando vacation.',
  review1Source: 'Google',
  review1Rating: '5',
  review2: 'Hippy Dippy Pool kept the kids entertained every afternoon, and mobile ordering at Everything POP Food Court worked reliably even during busy dinner hours after parks.',
  review2Source: 'TripAdvisor',
  review2Rating: '4',
  review3: 'Rooms are compact yet freshly renovated with clever fold-down Murphy beds, strong air conditioning, and helpful front desk staff who stored our luggage before check-in.',
  review3Source: 'Google',
  review3Rating: '5',
  review4: 'Great value for staying inside Walt Disney World, though bus rides to Magic Kingdom can take twenty minutes during evening park closing times on busy weekends.',
  review4Source: 'Yelp',
  review4Rating: '4',
};

const fetchedUrls = [];
const fetchImpl = async (url, init = {}) => {
  const href = String(url);
  fetchedUrls.push(href);
  assert.equal(href.toLowerCase().includes(BRAVE_DOMAIN), false, `unexpected Brave URL: ${href}`);
  if (href === VK_WAKE_URL) {
    const body = JSON.parse(String(init.body || '{}'));
    const q = String(body.place?.query || body.place?.title || '');
    if (/Pop Century/i.test(q)) return jsonResponse(popCenturyVkResult);
    return jsonResponse({
      thingName: 'Unlocated Mystery Hotel',
      type: 'hotel',
      sources: [{ url: 'https://example.org/mystery', title: 'Mystery Hotel', fetchedAt: '2026-11-24T12:00:00Z', text: 'A hotel with no published address or coordinates.' }],
    });
  }
  const parsed = new URL(href);
  if (parsed.hostname === NOMINATIM_HOST) {
    const q = String(parsed.searchParams.get('q') || '');
    if (/1050 Century/i.test(q)) {
      return jsonResponse([{
        lat: String(POP_LAT),
        lon: String(POP_LNG),
        display_name: "Disney's Pop Century Resort, 1050, Century Drive, Lake Buena Vista, Orange County, Florida, 32830, United States",
        address: { city: 'Lake Buena Vista', state: 'Florida', country_code: 'us' },
      }]);
    }
    if (/Orlando/i.test(q)) {
      return jsonResponse([{
        lat: '28.5383',
        lon: '-81.3792',
        display_name: 'Orlando, Orange County, Florida, United States',
        address: { city: 'Orlando', county: 'Orange County', state: 'Florida', country_code: 'us' },
      }]);
    }
    return jsonResponse([]);
  }
  throw new Error(`unexpected fetch URL: ${href}`);
};

const directIdentity = await resolveVkSearchPlaceIdentity(popCenturyVkResult, {
  category: 'hotel',
  env: { VK_SEARCH_WAKE_URL: VK_WAKE_URL },
  fetchImpl,
});
assert.equal(directIdentity.ok, true, 'expected VK Search + geocoder to resolve Pop Century');
const resolved = directIdentity.place;
assert.equal(resolved.title, "Disney's Pop Century Resort");
assert.equal(resolved.address, POP_ADDRESS);
assert.equal(resolved.lat, POP_LAT);
assert.equal(resolved.lng, POP_LNG);
assert.equal(resolved.addressSource, 'vk-search');
assert.equal(resolved.coordsSource, 'nominatim_geocode');
assert.equal(resolved.sourceRecord?.identityProvenance?.approvedDisplayTitle, "Disney's Pop Century Resort");
assert.equal(resolved.sourceRecord?.identityProvenance?.ccabKey, 'disneys-pop-century-resort-lake-buena-vista');
assert.equal(resolved.sourceRecord?.identityProvenance?.evidenceUrl, POP_URL);
assert.deepEqual(
  vkSearchPlaceSourceViolations(resolved),
  [],
  `resolved VK Search place must pass vkSearchPlaceSourceViolations, got: ${vkSearchPlaceSourceViolations(resolved).join(', ')}`,
);

const lodgingSearch = await searchIntakeLodgingPlaces({
  destination: 'Orlando, FL',
  areaHint: 'Orlando, FL',
  propertyName: "Disney's Pop Century Resort",
  env: { VK_SEARCH_WAKE_URL: VK_WAKE_URL },
  fetchImpl,
});
assert.equal(lodgingSearch.places.length, 1);
assert.equal(lodgingSearch.places[0].title, "Disney's Pop Century Resort");
assert.equal(lodgingSearch.places[0].address, POP_ADDRESS);
assert.equal(lodgingSearch.places[0].lat, POP_LAT);
assert.equal(lodgingSearch.places[0].lng, POP_LNG);
assert.deepEqual(vkSearchPlaceSourceViolations(lodgingSearch.places[0]), []);

const unresolved = await resolveVkSearchPlaceIdentity({
  thingName: 'Unlocated Mystery Hotel',
  type: 'hotel',
  sources: [{ url: 'https://example.org/mystery', title: 'Mystery Hotel', fetchedAt: '2026-11-24T12:00:00Z', text: 'A hotel with no published address or coordinates.' }],
}, { category: 'hotel', env: {}, fetchImpl });
assert.equal(unresolved.ok, false);
assert.equal(unresolved.place, null);
assert.equal(unresolved.reason, 'no_address_or_coordinates');

const unresolvedQuery = await queryVkSearchPlaces(
  fetchImpl,
  { VK_SEARCH_WAKE_URL: VK_WAKE_URL },
  { center: { lat: 28.5383, lng: -81.3792 }, locationText: 'Orlando, FL', namedPlaceLookup: true },
  [{ category: 'hotel', q: 'Unlocated Mystery Hotel, Orlando, FL', target: 'Unlocated Mystery Hotel', propertyName: 'Unlocated Mystery Hotel', intakeLodgingLookup: true }],
);
assert.deepEqual(unresolvedQuery.places, []);
assert.ok(unresolvedQuery.unresolvedReasons.includes('no_address_or_coordinates'));

const insertedRows = [];
const mockDb = async (strings, ...values) => {
  const q = strings.join(' ').replace(/\s+/g, ' ').trim();
  if (/insert into trip_things/i.test(q)) {
    const row = { id: `thing-${insertedRows.length + 1}`, title: values[3], location: values[6], metadata: values[9] };
    insertedRows.push(row);
    return [{ id: row.id }];
  }
  return [];
};
const missOutcome = await persistIntakeLodgingThings(mockDb, 'trip-orlando', null, [{ title: 'Unlocated Mystery Hotel' }], {
  destinationHint: 'Orlando, FL',
  areaHint: 'Orlando, FL',
  env: { VK_SEARCH_WAKE_URL: VK_WAKE_URL },
  fetchImpl,
});
assert.equal(missOutcome.misses.length, 1, 'place without sourced address/coords must record a miss');
assert.equal(missOutcome.saved.length, 1);
assert.equal(missOutcome.saved[0].location?.lat, undefined, 'must not invent latitude');
assert.equal(missOutcome.saved[0].location?.lng, undefined, 'must not invent longitude');
assert.equal(missOutcome.saved[0].location?.address, undefined, 'must not invent address');

assert.equal(fetchedUrls.some((href) => href.toLowerCase().includes(BRAVE_DOMAIN)), false);
console.log(JSON.stringify({ ok: true, checked: 'vk-search-place-identity', resolved: resolved.title }));
