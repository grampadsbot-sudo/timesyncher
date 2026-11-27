import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { buildTripStateChatCall, pinTripStateContext } from '../src/vacation/trip-state-model-context.mjs';
import { prepareProactiveTripState } from '../src/vacation/trip-state-proactive.mjs';
import { persistVacationAppCustomerTurn } from '../src/vacation/vacation-app-queue-persist.mjs';
import { useNominatimStore } from '../src/vacation/nominatim-store.mjs';
import { customerSection, severityOf } from './harness/findings.mjs';
import { measureInitialBuild } from './harness/initial-build.mjs';
import { provisionThrowaway } from './harness/live-provision.mjs';
import { buildScorecard } from './harness/scorecard.mjs';

const raw = new PGlite({ extensions: { pgcrypto } });
const db = async (parts, ...params) => (await raw.query(parts.reduce((sql, part, index) => index ? `${sql}$${index}${part}` : part, ''), params)).rows;
const pool = { async connect() { return { query: raw.query.bind(raw), release() {} }; } };
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-build-timing-'));
const story = {
  story_id: 'vk-001', reply_backend: 'trip_state', destination: 'Orlando',
  dates: { start: '2027-04-05', end: '2027-04-09' }, customer: { name: 'Synthetic Setup', email_alias: 'synthetic-setup' },
};
const env = { TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation.example', VK_SEARCH_WAKE_URL: 'https://vk-search.test/wake' };
const blurb = 'My sister and I are going to Orlando April 5–9, 2027. We want Cuban food, jazz bars, outdoor concerts, gardens, and a boutique hotel.';
const classification = {
  ok: true, destination: 'Orlando', hasDates: true, startDate: '2027-04-05', endDate: '2027-04-09',
  planningParty: 'My sister and I',
  planningWants: [
    { category: 'restaurant', value: 'Cuban food' }, { category: 'bar', value: 'jazz bars' },
    { category: 'event', value: 'outdoor concerts' }, { category: 'park', value: 'gardens' },
    { category: 'hotel', value: 'boutique hotel' },
  ],
};
const places = [
  ['Cuban food', 'restaurant', 'Mango Courtyard'], ['jazz bars', 'restaurant', 'Night Heron Jazz Club'],
  ['outdoor concerts', 'activity', 'Lakefront Music Series'], ['gardens', 'activity', 'Cypress Gardens'],
  ['boutique hotel', 'hotel', 'Palmetto Court Inn'],
];
const queries = [];
const fetchImpl = async (url, init) => {
  assert.equal(String(url), env.VK_SEARCH_WAKE_URL);
  const { place } = JSON.parse(init.body);
  queries.push(place);
  const index = places.findIndex(([term, category]) => place.category === category && place.query.includes(term));
  if (index < 0) return Response.json({ places: [] });
  const [, category, title] = places[index];
  return Response.json({ places: [{ externalId: `venue-${index}`, title, category, address: `${100 + index} Main Street, Orlando`, lat: 28.54, lng: -81.38 }] });
};

useNominatimStore({
  async getCachedGeocode() { return { lat: 28.54, lng: -81.38, label: 'Orlando' }; },
  async putCachedGeocode() {},
  async runNominatimThrottled() { assert.fail('fixture geocoding must use the cached center'); },
});

async function provision(runId, clearHeader = false) {
  const tag = `harness:${runId}:${story.story_id}`;
  const { tripId, customerId } = await provisionThrowaway(db, story, { tag, runId, outDir, env });
  if (clearHeader) await db`update trips set destination = null, start_date = null, end_date = null where id = ${tripId}`;
  const [trip] = await db`select * from trips where id = ${tripId}`;
  assert.equal(trip.metadata.trip_state_actions, true);
  assert.equal(trip.metadata.replyBackend, 'trip_state');
  return { trip, tripId, customerId, tag };
}

async function send({ trip, tripId, customerId }, turn, text, fields, activeEnv = env) {
  const { requestId } = await persistVacationAppCustomerTurn(db, {
    transcriptOwnerId: customerId, tripId, queuedJobType: 'vacation_intake', requestText: text,
    payload: { liveTranscript: { turnIndex: turn * 2 } }, customerTurnIndex: turn * 2, intakeLatency: 5,
    turnTag: { category: null, tags: [] }, jobFields: {},
  });
  const revision = await prepareProactiveTripState({
    trip, requestId, turn, actorId: customerId, classification: fields, text,
    firstCustomerStartedMs: Date.now() - 100, env: activeEnv, pool, fetchImpl,
  });
  return { revision, state: JSON.parse(revision.state_json) };
}

const checks = ['dialog-pdf', 'keepsake-pdf', 'screens', 'onboarding-screens-in-pdf', 'video-check', 'scorecard',
  'build-sha', 'no-stub-chrome', 'dialog-renderer-ok', 'video-check-pass', 'cleanup', 'itinerary-stored']
  .map((id) => ({ id, pass: true }));
function score(initialBuild) {
  return buildScorecard({
    reply_backend: 'trip_state', story_id: story.story_id, checks, initialBuild,
    started_at: '2027-01-01T00:00:00Z', ended_at: '2027-01-01T00:00:03Z',
    timings: [{ n: 1, customer_ms: 25, wall_ms: 1000 }],
  });
}

try {
  for (const name of ['001_vacation_mvp', '003_trip_things_source', '010_vacation_trip_state_actions', '011_vacation_trip_state_revisions']) {
    await raw.exec(fs.readFileSync(new URL(`../db/migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  const complete = await provision('complete-orlando');
  const { state } = await send(complete, 1, blurb, classification);
  assert.equal(state.updated_turn, 1);
  assert.equal(state.research.state, 'complete');
  assert.equal(queries.length, 5);
  assert.ok(queries.every(({ query }) => query.includes('Orlando') && query.includes('2027-04-05') && query.includes('2027-04-09')));
  assert.ok(Object.values(state.saved.days).every(({ assigned }) => assigned.length > 0));
  const placed = await db`
    select category from trip_things where trip_id = ${complete.tripId}
      and jsonb_array_length(coalesce(metadata->'tripState'->'occurrences', '[]')) > 0
  `;
  const expected = { hotel: 1, park: 1, restaurant: 1, bar: 1, event: 1 };
  assert.deepEqual(placed.map(({ category }) => category).sort(), Object.keys(expected).sort());
  assert.deepEqual(state.research.build.items_by_type, expected);
  assert.ok(state.research.build.started_offset_ms >= 100);
  assert.ok(state.research.build.duration_ms >= 0);
  const measured = await measureInitialBuild(db, complete.tripId, complete.tag);
  const passed = score(measured);
  assert.equal(passed.findings[0].status, 'PASS');
  assert.equal(passed.findings[0].firedByTurn2, true);
  assert.deepEqual(passed.findings[0].itemsByType, expected);
  assert.deepEqual(passed.timing, {
    turns: [{ turnNumber: 1, customerMs: 25, appMs: 1000 }], timeToBuildMs: state.research.build.started_offset_ms,
    buildDurationMs: state.research.build.duration_ms, totalWallMs: 3000,
  });

  const thin = await provision('thin-orlando', true);
  const thinText = 'Can you help plan a vacation?';
  const beforeCount = queries.length;
  const first = await send(thin, 1, thinText, { ok: true });
  assert.equal(queries.length, beforeCount);
  const missing = ['destination', 'dates', 'party', 'interests/wants'];
  assert.deepEqual(first.state.research.gaps, missing);
  assert.equal(first.state.next_steps[0].kind, 'ask');
  assert.deepEqual(first.state.next_steps[0].missing_inputs, missing);
  const call = buildTripStateChatCall({ tripStateContext: pinTripStateContext(first.revision), customerTurn: thinText });
  assert.match(call.messages[0].content.at(-1).text, /Ask one concise question covering exactly the fields in missing_inputs/);
  const trusted = JSON.parse(call.messages[1].content[0].text).trip_state;
  assert.deepEqual(trusted.next_steps[0].missing_inputs, missing);
  assert.equal(trusted.capabilities.actions.save_plan.enabled, true);
  const noBuild = await measureInitialBuild(db, thin.tripId, thin.tag);
  assert.equal(noBuild.turn, null);
  const second = await send(thin, 2, blurb, classification);
  assert.equal(second.state.research.turn, 2);
  assert.deepEqual(second.state.research.build.items_by_type, expected);
  assert.equal((await measureInitialBuild(db, thin.tripId, thin.tag)).turn, 2);

  const empty = await provision('empty-search');
  const { state: emptyState } = await send(empty, 1, blurb, classification, {});
  assert.equal(emptyState.research.provider_unavailable, true);
  const zero = await measureInitialBuild(db, empty.tripId, empty.tag);
  for (const [evidence, detail] of [[noBuild, /No initial build recorded/], [zero, /VK Search was unavailable.*zero placed items/],
    [{ ...measured, turn: 3 }, /customer turn 3/]]) {
    const card = score(evidence);
    assert.equal(card.verdict, 'PASS');
    assert.equal(card.checks.some(({ id }) => id === 'initial-build'), false);
    assert.equal(card.findings[0].status, 'FLAGGED');
    assert.equal(card.findings[0].severity, 'major');
    assert.match(card.findings[0].detail, detail);
    assert.match(customerSection(card, { wave: 'offline' }), /initial-build: FLAGGED \(major\)/);
    assert.equal(severityOf(card), 'major');
  }
  const isolated = await measureInitialBuild(db, randomUUID(), thin.tag);
  assert.equal(isolated, null);
  for (const dir of ['src', 'routes', 'public']) {
    for (const entry of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.[cm]?js$|\.tsx?$/.test(entry.name)) continue;
      assert.ok(!fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8').includes("'initial-build'"), entry.name);
    }
  }
} finally {
  await raw.close();
  fs.rmSync(outDir, { recursive: true, force: true });
}

console.log('test_vk_initial_build_timing: ok');
