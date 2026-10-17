import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorizeLogoReenrichment, reenrichTripLogos } from '../src/vacation/logo-reenrichment.mjs';

const tripId = 'trip-1';
const site = 'https://www.bluenote.net/';
const icon = 'https://www.bluenote.net/apple-touch-icon.png';
const actor = 'vk449-test';

function store(rows) {
  const state = { rows: structuredClone(rows), audit: [], updates: 0 };
  const db = async (parts, ...values) => {
    const sql = parts.join(' ');
    if (/select id, trip_id, title, metadata/.test(sql)) {
      const [trip, ids] = values;
      return state.rows.filter((row) => row.trip_id === trip && ids.includes(row.id));
    }
    if (/update trip_things/.test(sql)) {
      const [json, id, trip] = values;
      const row = state.rows.find((r) => r.id === id && r.trip_id === trip);
      const has = row && (row.metadata.logoUrl || row.metadata.sourceRecord?.logoUrl);
      if (!row || has) return [];
      row.metadata = JSON.parse(json);
      state.updates += 1;
      return [{ id }];
    }
    if (/insert into trip_thing_logo_audit/.test(sql)) {
      const [trip, thing, who, oldValue, newValue, sourceUrl, outcome, at] = values;
      state.audit.push({ trip, thing, who, oldValue, newValue, sourceUrl, outcome, at });
      return [];
    }
    throw new Error(`unexpected sql ${sql}`);
  };
  return { db, state };
}

function http(available = true) {
  return async (url) => {
    const href = String(url);
    if (href === site) {
      return { ok: true, status: 200, url: site, headers: new Headers({ 'content-type': 'text/html' }), text: async () => `<link rel="apple-touch-icon" sizes="180x180" href="${icon}">` };
    }
    if (href === icon && available) return { ok: true, status: 200, url: icon, headers: new Headers({ 'content-type': 'image/png' }), body: null };
    return { ok: false, status: 404, url: href, headers: new Headers({ 'content-type': 'text/html' }), body: null, text: async () => '' };
  };
}

const rows = () => [
  { id: 'a', trip_id: tripId, title: 'Blue Note', metadata: { sourceRecord: { website: site } } },
  { id: 'b', trip_id: tripId, title: 'Has Logo', metadata: { logoUrl: 'https://keep.example/logo.png', sourceRecord: { website: site } } },
  { id: 'c', trip_id: 'trip-2', title: 'Other Trip', metadata: { sourceRecord: { website: site } } },
];

test('dry run persists nothing and reports the discovery', async () => {
  const { db, state } = store(rows());
  const result = await reenrichTripLogos({ db, tripId, thingIds: ['a'], actor, fetchImpl: http() });
  assert.equal(result.dryRun, true);
  assert.equal(result.report[0].new, icon);
  assert.equal(result.report[0].sourceUrl, site);
  assert.equal(state.updates, 0);
  assert.equal(state.audit.length, 0);
  assert.equal(state.rows[0].metadata.logoUrl, undefined);
});

test('authorized apply stores logoUrl with provenance and an audit row', async () => {
  const { db, state } = store(rows());
  await reenrichTripLogos({ db, tripId, thingIds: ['a'], actor, apply: true, fetchImpl: http(), now: () => 'T1' });
  assert.equal(state.rows[0].metadata.logoUrl, icon);
  assert.deepEqual(state.rows[0].metadata.sourceRecord.logoProvenance, { pageUrl: site, iconUrl: icon });
  assert.deepEqual(state.audit, [{ trip: tripId, thing: 'a', who: actor, oldValue: null, newValue: icon, sourceUrl: site, outcome: 'filled', at: 'T1' }]);
});

test('authorization needs the admin token and an actor', () => {
  const env = { TIMESYNCHER_ADMIN_TOKEN: 'secret' };
  assert.throws(() => authorizeLogoReenrichment({ token: 'wrong', actor }, env), { statusCode: 401 });
  assert.throws(() => authorizeLogoReenrichment({ token: '', actor }, env), { statusCode: 401 });
  assert.throws(() => authorizeLogoReenrichment({ token: 'secret', actor: '' }, env), { statusCode: 400 });
  assert.throws(() => authorizeLogoReenrichment({ token: 'x' }, {}), { statusCode: 503 });
  assert.equal(authorizeLogoReenrichment({ token: 'secret', actor }, env), actor);
});

test('other-trip and unknown ids are rejected before any write', async () => {
  const { db, state } = store(rows());
  await assert.rejects(reenrichTripLogos({ db, tripId, thingIds: ['a', 'c'], actor, apply: true, fetchImpl: http() }), { statusCode: 403 });
  await assert.rejects(reenrichTripLogos({ db, tripId, thingIds: ['a', 'zzz'], actor, apply: true, fetchImpl: http() }), { statusCode: 403 });
  assert.equal(state.updates, 0);
  assert.equal(state.audit.length, 0);
});

test('a non-empty logo is never overwritten', async () => {
  const { db, state } = store(rows());
  const result = await reenrichTripLogos({ db, tripId, thingIds: ['b'], actor, apply: true, fetchImpl: http() });
  assert.equal(result.report[0].outcome, 'skipped_has_logo');
  assert.equal(state.rows[1].metadata.logoUrl, 'https://keep.example/logo.png');
  assert.equal(state.audit.length, 0);
});

test('an unavailable logo stays empty and is flagged', async () => {
  const { db, state } = store(rows());
  const result = await reenrichTripLogos({ db, tripId, thingIds: ['a'], actor, apply: true, fetchImpl: http(false) });
  assert.equal(result.report[0].outcome, 'unavailable');
  assert.equal(state.rows[0].metadata.logoUrl, undefined);
  assert.ok(state.rows[0].metadata.missingFields.includes('logo'));
  assert.ok(state.rows[0].metadata.logoCaptureReason);
});

test('a row with no website stays empty and flagged', async () => {
  const { db, state } = store([{ id: 'n', trip_id: tripId, title: 'No Site', metadata: {} }]);
  const result = await reenrichTripLogos({ db, tripId, thingIds: ['n'], actor, apply: true, fetchImpl: http() });
  assert.equal(result.report[0].outcome, 'unavailable');
  assert.equal(result.report[0].reason, 'no_verified_place_website');
  assert.deepEqual(state.rows[0].metadata.missingFields, ['logo']);
});

test('retry is idempotent', async () => {
  const { db, state } = store(rows());
  const args = { db, tripId, thingIds: ['a'], actor, apply: true, fetchImpl: http() };
  await reenrichTripLogos(args);
  const second = await reenrichTripLogos(args);
  assert.equal(second.report[0].outcome, 'skipped_has_logo');
  assert.equal(state.updates, 1);
  assert.equal(state.audit.length, 1);
});
