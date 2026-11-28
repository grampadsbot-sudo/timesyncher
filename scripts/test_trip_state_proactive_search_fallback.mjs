import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { useNominatimStore } from '../src/vacation/nominatim-store.mjs';
import { isNominatimOpenStreetMapUrl } from '../src/vacation/place-search-geocode.mjs';
import { prepareProactiveTripState } from '../src/vacation/trip-state-proactive.mjs';

const tripId = 'af88d578-85ab-44b1-9086-1ec348004031';
const actorId = '4294a4ca-3c70-4243-87a6-5a374670ef64';
const trip = {
  id: tripId, customer_id: actorId, title: 'Harbor City Vacation', destination: 'Harbor City',
  start_date: '2028-05-05', end_date: '2028-05-08', status: 'onboarding',
  metadata: { trip_state_actions: true, intakeShare: true },
};
const env = { tavily: 'offline-test' };
const places = {
  lodging: { name: 'Bayview Inn', type: 'hotel', category: 'tourism', url: 'https://bayviewinn.example.com' },
  dining: { name: 'Pier Chowder House', type: 'restaurant', category: 'amenity', url: 'https://pierchowder.example.com' },
};
const queries = [];
const placeLookup = (place, id, lat = '36.6003') => ({
  place_id: id, osm_type: 'node', osm_id: id, name: place.name, type: place.type, category: place.category,
  lat, lon: '-121.8947', display_name: `${place.name}, Harbor City, California`,
});
const diningLookup = placeLookup(places.dining, 11);
const faraway = { title: 'Distant Bistro', url: 'https://distantbistro.example.com' };
const guide = { title: 'Best Places to Eat in Harbor City', url: 'https://harborguide.example.com' };

const fetchImpl = async (url, init) => {
  const target = new URL(url);
  if (target.pathname === '/search' && isNominatimOpenStreetMapUrl(url)) {
    const name = target.searchParams.get('q');
    if (name === 'Harbor City') {
      return Response.json([{ lat: '36.6002', lon: '-121.8947', display_name: 'Harbor City, California' }]);
    }
    if (name.startsWith(places.lodging.name)) return Response.json([placeLookup(places.lodging, 10)]);
    if (name.startsWith(places.dining.name) || name.startsWith(guide.title)) return Response.json([diningLookup]);
    if (name.startsWith(faraway.title)) {
      return Response.json([placeLookup({ ...places.dining, name: faraway.title }, 12, '38.0')]);
    }
  }
  if (target.pathname === '/search' && init?.method === 'POST') {
    const { query } = JSON.parse(init.body);
    queries.push(query);
    const lodging = query.includes('lodging');
    const place = lodging ? places.lodging : places.dining;
    return Response.json({ results: [
      { title: `${place.name} | Official Site`, url: place.url },
      ...(lodging ? [] : [guide, faraway]),
    ] });
  }
  assert.fail(`Unexpected offline fetch ${url}`);
};

useNominatimStore({
  async getCachedGeocode() { return null; },
  async putCachedGeocode() {},
  async runNominatimThrottled(work) { return { result: await work(), throttleWaitMs: 0 }; },
});

const db = new PGlite({ extensions: { pgcrypto } });
try {
  for (const migration of ['001_vacation_mvp', '003_trip_things_source', '010_vacation_trip_state_actions', '011_vacation_trip_state_revisions']) {
    await db.exec(readFileSync(new URL(`../db/migrations/${migration}.sql`, import.meta.url), 'utf8'));
  }
  await db.query('insert into customers (id) values ($1)', [actorId]);
  await db.query(`insert into trips (id, customer_id, title, destination, start_date, end_date, status, metadata)
    values ($1, $2, $3, $4, $5, $6, $7, $8)`, Object.values(trip));
  const revision = await prepareProactiveTripState({
    trip, requestId: 'search-fallback', turn: 1, actorId, env, fetchImpl,
    pool: { connect: async () => ({ query: db.query.bind(db), release() {} }) },
    classification: { ok: true, planningParty: 'two adults',
      planningWants: [{ category: 'hotel', value: 'lodging' }, { category: 'restaurant', value: 'dining' }] },
    text: 'Two adults looking for lodging and dining around Harbor City.',
  });
  const state = JSON.parse(revision.state_json);
  assert.equal(state.research.provider_unavailable, undefined);
  assert.equal(state.research.state, 'complete');
  assert.equal(queries.length, 2);
  assert.ok(queries.every((query) => query.includes('Harbor City')));
  const candidates = Object.values(state.candidates);
  assert.deepEqual(candidates.map(({ title, source }) => [title, source]).sort(), [
    [places.lodging.name, 'tavily'], [places.dining.name, 'tavily'],
  ]);
  assert.deepEqual(state.research.build.items_by_type, { hotel: 1, restaurant: 1 });
  const assigned = Object.values(state.saved.days).flatMap(({ assigned }) => assigned.map(({ item }) => state.saved.items[item].title));
  assert.ok(assigned.includes(places.lodging.name));
  assert.ok(assigned.includes(places.dining.name));
} finally {
  await db.close();
  useNominatimStore(null);
}

console.log('test_trip_state_proactive_search_fallback: ok');
