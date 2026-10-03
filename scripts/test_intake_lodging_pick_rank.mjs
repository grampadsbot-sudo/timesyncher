#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  braveAddress,
  braveCategoryName,
  braveLocalPlaceResult,
  bravePlaceSearchRows,
  bravePoint,
  braveProviderCategories,
  braveTitle,
} from '../src/vacation/brave-place-query.mjs';
import {
  intakeLodgingNameSimilarity,
  normalizePlaceName,
  pickIntakeLodgingCandidate,
  rankIntakeLodgingCandidates,
} from '../src/vacation/intake-lodging-candidate.mjs';
import { braveResultHasLodgingTag, isLodgingProviderPlace } from '../src/vacation/intake-lodging-category.mjs';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/intake-lodging-brave/', import.meta.url));
const HYATT_ID = 'loc4JAZKW55Y5E2EAK34Y45CNFTDYC7U26EQBJUMNMY=';
const KIHEI_IDS = new Set([
  'loc4P7XYB7FWW42EAOOONXBD3DTDYBDQ7XNTOVP2GWA=',
  'loc4HPLZYKFOW42EBQ5DIOLDXDTDYDGYG3CTOVP2GWA=',
]);

function loadFixture(name) {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, 'utf8'));
}

function bravePlacesFromFixture(fixture, category = 'hotel') {
  const rows = [];
  const braveRows = bravePlaceSearchRows(fixture, 'local');
  for (let providerRank = 0; providerRank < braveRows.length; providerRank += 1) {
    const result = braveRows[providerRank];
    if (!braveLocalPlaceResult(result)) continue;
    const point = bravePoint(result);
    const title = braveTitle(result?.title || result?.name);
    const address = braveAddress(result);
    if (!title) continue;
    rows.push({
      source: 'brave',
      title,
      category,
      lat: point.lat,
      lng: point.lng,
      address,
      url: String(result?.url || ''),
      externalId: String(result?.id || result?.url || ''),
      categoryName: braveCategoryName(result),
      providerCategories: braveProviderCategories(result),
      providerRank,
      sourceRecord: result,
    });
  }
  return rows;
}

assert.equal(normalizePlaceName('Kīhei'), normalizePlaceName('Kihei'));
assert.ok(intakeLodgingNameSimilarity('Kihei Kai Nani', 'Kīhei Kai Nani Rentals') > 0.5);
assert.ok(
  intakeLodgingNameSimilarity('Kihei Kai Nani', 'Awesome Vacation Kīhei Rentals at Maui Vista And Kīhei Kai Nani')
  < intakeLodgingNameSimilarity('Kihei Kai Nani', 'Kihei Kai Nani Condo'),
);

const hyattPlaces = bravePlacesFromFixture(loadFixture('hyatt-live-h.json'));
const kiheiPlaces = bravePlacesFromFixture(loadFixture('kihei-live-h2.json'));
assert.equal(hyattPlaces.length, 5);
assert.equal(kiheiPlaces.length, 3);

const kaanapaliCenter = { lat: 20.9250419, lng: -156.6899009 };
const hyattPick = pickIntakeLodgingCandidate(hyattPlaces, {
  propertyName: 'Hyatt Regency Maui',
  areaText: 'Kaanapali',
  areaCenter: kaanapaliCenter,
});
assert.equal(hyattPick.externalId, HYATT_ID);
assert.equal(hyattPick.title, 'Hyatt Regency Maui Resort & Spa');

const hyattRanked = rankIntakeLodgingCandidates(hyattPlaces, {
  propertyName: 'Hyatt Regency Maui',
  areaText: 'Kaanapali',
  areaCenter: kaanapaliCenter,
});
assert.equal(hyattRanked.pickRanking.winner.externalId, HYATT_ID);
assert.ok(hyattRanked.pickRanking.winner.similarityScore > 0);
assert.equal(hyattRanked.pickRanking.winner.providerRank, 0);
assert.ok(hyattRanked.pickRanking.runnersUp.some((row) => row.outcome === 'rejected_lodging_tag'));

const kiheiCenter = { lat: 20.7174725, lng: -156.4450036 };
const kiheiPick = pickIntakeLodgingCandidate(kiheiPlaces, {
  propertyName: 'Kihei Kai Nani',
  areaText: 'Kihei',
  areaCenter: kiheiCenter,
});
assert.ok(KIHEI_IDS.has(kiheiPick.externalId));
assert.match(kiheiPick.address || braveAddress(kiheiPick.sourceRecord), /2495 S Kihei Rd/i);

const giftOnly = hyattPlaces.filter((place) => !braveResultHasLodgingTag(place.sourceRecord));
assert.equal(giftOnly.length, 2);
const giftMiss = rankIntakeLodgingCandidates(giftOnly, {
  propertyName: 'Hyatt Regency Maui',
  areaText: 'Kaanapali',
  areaCenter: kaanapaliCenter,
});
assert.equal(giftMiss.picked, null);

function mockTripDb() {
  const tripThings = [];
  const lookups = [];
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (sql.includes('insert into trip_things')) {
      const viaInsertTripThing = sql.includes('source_request_id');
      const title = viaInsertTripThing ? values[4] : values[2];
      const locationRaw = viaInsertTripThing ? values[10] : values.find((value) => typeof value === 'string' && value.includes('"lat"'));
      const location = typeof locationRaw === 'string' ? JSON.parse(locationRaw) : (locationRaw || {});
      tripThings.push({ title, location });
      return [{ id: 'thing-1' }];
    }
    if (sql.includes('update trips') && sql.includes('metadata')) {
      const payload = values.find((value) => value && typeof value === 'object' && value.intakeLodgingLookup);
      if (payload?.intakeLodgingLookup) lookups.push(payload.intakeLodgingLookup);
      return [];
    }
    return [];
  };
  return { db, tripThings, lookups };
}

const { db: hyattDb, tripThings: hyattThings } = mockTripDb();
const hyattOutcome = await persistIntakeLodgingThings(hyattDb, 'trip-h', 'req-h', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async () => ({
    places: hyattPlaces,
    providers: [{ provider: 'brave', status: 'ok', resultCount: hyattPlaces.length }],
    center: kaanapaliCenter,
  }),
});
assert.equal(hyattThings[0].title, 'Hyatt Regency Maui Resort & Spa');
assert.equal(hyattOutcome.lookups[0].pickRanking.winner.externalId, HYATT_ID);

const { db: kiheiDb, tripThings: kiheiThings } = mockTripDb();
const kiheiOutcome = await persistIntakeLodgingThings(kiheiDb, 'trip-k', 'req-k', [{ title: 'Kihei Kai Nani', category: 'hotel' }], {
  areaHint: 'Kihei',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async () => ({
    places: kiheiPlaces,
    providers: [{ provider: 'brave', status: 'ok', resultCount: kiheiPlaces.length }],
    center: kiheiCenter,
  }),
});
const kiheiSaved = kiheiThings[0];
const kiheiExternalId = kiheiPlaces.find((row) => row.title === kiheiSaved.title)?.externalId;
assert.ok(KIHEI_IDS.has(kiheiExternalId));
assert.ok(/2495 S Kihei Rd/i.test(String(kiheiSaved.location.address || '')));
assert.ok(kiheiOutcome.lookups[0].pickRanking.winner.similarityScore > 0.4);

assert.equal(
  isLodgingProviderPlace({
    source: 'brave',
    title: 'Accents Hyatt Regency Maui',
    category: 'hotel',
    sourceRecord: hyattPlaces.find((row) => row.title.startsWith('Accents')).sourceRecord,
  }),
  false,
);

console.log('test_intake_lodging_pick_rank: ok');
