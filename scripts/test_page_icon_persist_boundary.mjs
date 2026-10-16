#!/usr/bin/env node
import assert from 'node:assert/strict';

import { insertTripThing } from '../src/vacation/trip-things.mjs';
import { placeToTripThing, searchPlaces } from '../src/vacation/place-search.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const BLUE_NOTE_PAGE = 'https://www.bluenote.net/jazz-club-new-york/';
const BLUE_NOTE_CANONICAL = 'https://www.bluenotejazz.com/';
const ICON_192 = 'https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-192x192.png';
const BLUE_NOTE_HEAD = `<head>
<link rel="icon" href="https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-32x32.png" sizes="32x32" />
<link rel="icon" href="https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-192x192.png" sizes="192x192" />
<link rel="apple-touch-icon" href="https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-180x180.png" />
</head>`;
const VENUE_PAGE = 'https://venue.example/club';
const VENUE_ICON = 'https://venue.example/logo.png';
function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Headers(),
    body: null,
  };
}

function searchFetch({ osmElements = [], braveResults = [] } = {}) {
  const hosts = [];
  const urls = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    urls.push(href);
    const host = new URL(href).hostname;
    hosts.push(host);
    if (host.startsWith('nominatim.')) {
      return jsonResponse([{ lat: '38.7223', lon: '-9.1393', display_name: 'Lisbon, Portugal' }]);
    }
    if (host.startsWith('overpass-')) return jsonResponse({ elements: osmElements });
    if (host.includes('search.brave')) return jsonResponse({ results: braveResults });
    if (host.endsWith('router.ai')) return jsonResponse({ answers: { relevance: { choice: 5 } } });
    return {
      ok: false,
      status: 404,
      url: href,
      headers: new Headers(),
      text: async () => '',
      body: null,
    };
  };
  return { fetchImpl, hosts, urls };
}

const placeEnv = {
  brave: 'brave-test-key',
  braveName: 'BRAVE_SEARCH_API_KEY',
  OPENROUTER_API_KEY: 'test-openrouter-key',
};

const braveSearch = searchFetch({
  braveResults: [{
    title: 'Blue Note',
    url: BLUE_NOTE_PAGE,
    coordinates: [38.7225, -9.1395],
  }],
});
const braveFound = await searchPlaces({
  destination: 'Lisbon',
  wantedThings: [{ name: 'Blue Note', kind: 'activity' }],
  env: placeEnv,
  fetchImpl: braveSearch.fetchImpl,
  loadPriorPlaces: async () => [],
});
assert.equal(braveFound.places.some((place) => place.title === 'Blue Note'), true);
assert.equal(braveSearch.urls.some((url) => url.includes('bluenote')), false);
assert.equal(braveSearch.hosts.includes('www.bluenote.net'), false);

const osmSearch = searchFetch({
  osmElements: [
    { type: 'node', id: 11, lat: 38.7225, lon: -9.1395, tags: { name: 'Harbor Cafe', amenity: 'restaurant' } },
  ],
});
const osmFound = await searchPlaces({
  destination: 'Lisbon',
  wantedThings: [{ name: 'Harbor Cafe', kind: 'restaurant' }],
  env: placeEnv,
  fetchImpl: osmSearch.fetchImpl,
  loadPriorPlaces: async () => [],
});
assert.equal(osmFound.places.some((place) => place.title === 'Harbor Cafe'), true);
assert.equal(osmSearch.urls.some((url) => new URL(url).hostname === 'www.openstreetmap.org'), false);

function pageResponse(url, { finalUrl = url, html = '', type = 'text/html; charset=UTF-8', status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl,
    headers: new Headers({ 'content-type': type }),
    text: async () => html,
    body: null,
  };
}

function discoveryFetch() {
  const calls = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href === BLUE_NOTE_PAGE) return pageResponse(href, { finalUrl: BLUE_NOTE_CANONICAL, html: BLUE_NOTE_HEAD });
    if (href === ICON_192) return pageResponse(href, { type: 'image/png' });
    if (href === VENUE_PAGE) {
      return pageResponse(href, { html: '<link rel="icon" href="/logo.png" sizes="64x64">' });
    }
    if (href === VENUE_ICON) return pageResponse(href, { type: 'image/png' });
    return pageResponse(href, { status: 404, html: '' });
  };
  return { fetchImpl, calls };
}

function insertDb() {
  return async (strings) => {
    const sql = strings.join(' ');
    if (/insert into trip_things/i.test(sql)) return [{ id: 'saved-thing' }];
    if (/count\(\*\)/i.test(sql)) return [{ n: 0 }];
    return [];
  };
}

const discovered = discoveryFetch();
const blueNote = placeToTripThing({
  source: 'brave',
  category: 'music',
  title: 'Blue Note Jazz Club',
  lat: 40.7308,
  lng: -74.0006,
  url: BLUE_NOTE_PAGE,
  externalId: 'brave:blue-note',
  sourceRecord: { source: 'brave', url: BLUE_NOTE_PAGE, website: BLUE_NOTE_PAGE },
});
const savedNote = await insertTripThing(insertDb(), {
  tripId: '00000000-0000-4000-8000-000000000441',
  requestId: 'req-blue-note',
  thing: blueNote,
  fetchImpl: discovered.fetchImpl,
});
assert.equal(savedNote.metadata.logoUrl, ICON_192);
assert.equal(savedNote.metadata.sourceRecord.logoUrl, ICON_192);
assert.equal(savedNote.metadata.sourceRecord.website, BLUE_NOTE_CANONICAL);
assert.equal(savedNote.metadata.logoCaptureReason, undefined);
assert.deepEqual(discovered.calls, [BLUE_NOTE_PAGE, ICON_192]);

const venue = placeToTripThing({
  source: 'brave',
  category: 'music',
  title: 'Venue Example',
  lat: 40.73,
  lng: -74,
  url: VENUE_PAGE,
  externalId: 'brave:venue',
  sourceRecord: { source: 'brave', url: VENUE_PAGE, website: VENUE_PAGE },
});
const savedVenue = await insertTripThing(insertDb(), {
  tripId: '00000000-0000-4000-8000-000000000442',
  requestId: 'req-venue',
  thing: venue,
  fetchImpl: discovered.fetchImpl,
});
assert.equal(savedVenue.metadata.logoUrl, VENUE_ICON);
assert.equal(discovered.calls.filter((url) => url === VENUE_PAGE).length, 1);
assert.equal(discovered.calls.filter((url) => url === BLUE_NOTE_PAGE).length, 1);

const providerFetch = discoveryFetch();
const osmPage = placeToTripThing({
  source: 'osm',
  category: 'music',
  title: 'Blue Note Jazz Club',
  lat: 40.7308,
  lng: -74.0006,
  url: 'https://www.openstreetmap.org/node/11',
  externalId: 'node/11',
  sourceRecord: { source: 'osm', url: 'https://www.openstreetmap.org/node/11' },
});
const savedOsm = await insertTripThing(insertDb(), {
  tripId: '00000000-0000-4000-8000-000000000443',
  requestId: 'req-osm',
  thing: osmPage,
  fetchImpl: providerFetch.fetchImpl,
});
assert.deepEqual(providerFetch.calls, []);
assert.equal(savedOsm.metadata.logoUrl, undefined);
assert.equal(savedOsm.metadata.logoCaptureReason, 'no_place_website');

const directory = placeToTripThing({
  source: 'brave',
  category: 'music',
  title: 'Blue Note Jazz Club',
  lat: 40.7308,
  lng: -74.0006,
  url: 'https://www.tripadvisor.com/Attraction_Review-g60763-d123-Blue_Note.html',
  website: 'https://maps.google.com/maps?q=Blue+Note',
  externalId: 'brave:directory',
  sourceRecord: {
    source: 'brave',
    url: 'https://www.tripadvisor.com/Attraction_Review-g60763-d123-Blue_Note.html',
    website: 'https://www.yelp.com/biz/blue-note-jazz-club-new-york',
  },
});
const savedDirectory = await insertTripThing(insertDb(), {
  tripId: '00000000-0000-4000-8000-000000000444',
  requestId: 'req-directory',
  thing: directory,
  fetchImpl: providerFetch.fetchImpl,
});
assert.deepEqual(providerFetch.calls, []);
assert.equal(savedDirectory.metadata.logoUrl, undefined);
assert.equal(savedDirectory.metadata.logoCaptureReason, 'no_place_website');

console.log('test_page_icon_persist_boundary: ok');
