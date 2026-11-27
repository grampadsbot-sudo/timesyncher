import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { useNominatimStore } from '../src/vacation/nominatim-store.mjs';
import { createTripStateActions } from '../src/vacation/trip-state-actions.mjs';
import { createTripStateActionStore } from '../src/vacation/trip-state-action-store.mjs';
import {
  TRIP_STATE_PROACTIVE_PLAN_INSTRUCTION,
  buildTripStateChatCall,
  hasProactiveFirstPassAction,
  pinTripStateContext,
} from '../src/vacation/trip-state-model-context.mjs';
import { prepareProactiveTripState } from '../src/vacation/trip-state-proactive.mjs';
import { proactiveResearchKey } from '../src/vacation/trip-state-proactive-plan.mjs';
import { searchProactiveItinerary } from '../src/vacation/trip-state-proactive-research.mjs';
import { listTripStateRevisions } from '../src/vacation/trip-state-revision-store.mjs';

const file = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ajv = new Ajv2020({ strictRequired: false, strictTypes: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(file('../src/vacation/trip-state.schema.json')));
const BASE_INTENT = { intent: { asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: false } };

async function withMockFetch(handler, fn) {
  const original = globalThis.fetch;
  const originalPath = process.env.PATH;
  globalThis.fetch = handler;
  process.env.PATH = '/nonexistent';
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
}

const vkSearchPlaces = {
  hotel: [
    {
      externalId: 'vk-hotel-1', title: 'Bayview Inn', category: 'hotel',
      address: '100 Harbor Way, Harbor City, CA', lat: 36.6002, lng: -121.8947,
      url: 'https://bayviewinn.example.com', price: 210,
    },
    {
      externalId: 'vk-hotel-2', title: 'Seaside Suites', category: 'hotel',
      address: '140 Harbor Way, Harbor City, CA', lat: 36.6012, lng: -121.8937,
      url: 'https://seasidesuites.example.com', price: 185,
    },
  ],
  activity: [
    {
      externalId: 'vk-park-1', title: 'Tidepool Beach Park', category: 'activity',
      address: '210 Coast Rd, Harbor City, CA', lat: 36.602, lng: -121.896,
      url: 'https://tidepoolpark.example.com',
    },
    {
      externalId: 'vk-park-2', title: 'Cypress Trail Overlook', category: 'activity',
      address: '305 Bluff Rd, Harbor City, CA', lat: 36.603, lng: -121.892,
      url: 'https://cypresstrail.example.com',
    },
  ],
  restaurant: [
    {
      externalId: 'vk-rest-1', title: 'Pier Chowder House', category: 'restaurant',
      address: '12 Wharf St, Harbor City, CA', lat: 36.6008, lng: -121.8951,
      url: 'https://pierchowder.example.com', price: 24,
    },
    {
      externalId: 'vk-rest-2', title: 'Sandpiper Cafe', category: 'restaurant',
      address: '44 Wharf St, Harbor City, CA', lat: 36.6015, lng: -121.8942,
      url: 'https://sandpipercafe.example.com', price: 18,
    },
  ],
};

function createOfflineSearchFetch(log) {
  let retriedRestaurant = false;
  return async (url, init = {}) => {
    const href = String(url);
    if (href.includes('nominatim') || href.includes('/search?')) {
      return Response.json([{
        lat: '36.6002', lon: '-121.8947',
        display_name: 'Harbor City, California, United States',
        address: { city: 'Harbor City', state: 'California', country_code: 'us' },
      }]);
    }
    if (href === 'https://vk-search.test/wake') {
      const body = JSON.parse(init.body);
      const category = body.place.category;
      log.push({ category, query: body.place.query });
      if (category === 'restaurant' && !retriedRestaurant) {
        retriedRestaurant = true;
        return new Response('temporary overload', { status: 503 });
      }
      return Response.json({ places: vkSearchPlaces[category] || [] });
    }
    throw new Error(`Unexpected offline fetch URL: ${href}`);
  };
}

const geocodeCache = new Map();
useNominatimStore({
  async getCachedGeocode(key) {
    return geocodeCache.get(key) ?? null;
  },
  async putCachedGeocode(key, payload) {
    geocodeCache.set(key, payload);
  },
  async runNominatimThrottled(work) {
    return { result: await work(), throttleWaitMs: 0 };
  },
});

{
  const queries = [];
  const key = proactiveResearchKey({
    id: '56830c9f-6517-481f-9f7b-930a61c44102', destination: 'Harbor City',
    start_date: '2028-05-05', end_date: '2028-05-08',
  });
  assert.ok(key && key.startsWith('plan-'));
  const result = await searchProactiveItinerary({
    destination: 'Harbor City', start: '2028-05-05', end: '2028-05-08',
    criteria: ['family-friendly for ages 6 and 9', 'budget-friendly $2,000', 'low-key, easy pace'],
    turn: 2, key,
    env: { VK_SEARCH_WAKE_URL: 'https://vk-search.test/wake' },
    fetchImpl: createOfflineSearchFetch(queries),
  });
  assert.equal(result.research.key, key);
  assert.equal(result.research.state, 'complete');
  assert.deepEqual(result.research.areas, ['Harbor City']);
  assert.deepEqual(result.research.gaps, []);
  assert.equal(Object.keys(result.candidates).length, 6);
  assert.ok(queries.some((row) => row.query.includes('ages 6 and 9') && row.query.includes('$2,000')));
  assert.equal(queries.filter((row) => row.category === 'restaurant').length, 2);
}

const raw = new PGlite({ extensions: { pgcrypto } });
let serial = Promise.resolve();
const pool = {
  async connect() {
    const prior = serial;
    let release;
    serial = new Promise((resolve) => { release = resolve; });
    await prior;
    return { query: raw.query.bind(raw), release };
  },
};
const db = async (parts, ...params) => {
  const sql = parts.reduce((out, part, index) => (index ? `${out}$${index}${part}` : part), '');
  return (await raw.query(sql, params)).rows;
};

try {
  await raw.exec(file('../db/migrations/001_vacation_mvp.sql'));
  await raw.exec(file('../db/migrations/003_trip_things_source.sql'));
  await raw.exec(file('../db/migrations/010_vacation_trip_state_actions.sql'));
  await raw.exec(file('../db/migrations/011_vacation_trip_state_revisions.sql'));

  const actorId = '85b0757c-a9d7-4bb0-96d4-78c28a4c86d5';
  const tripId = 'b24d0645-8dea-4cbe-97de-fce01f5a4814';
  const offTripId = 'c35e1756-9efb-4dcf-a8ef-0df12e6b5925';
  const existingPierId = '10000000-0000-4000-a000-000000000011';
  await db`insert into customers (id) values (${actorId})`;
  await db`
    insert into trips (id, customer_id, title, destination, start_date, end_date, status, metadata)
    values (
      ${tripId}, ${actorId}, 'Harbor City Family Trip', null, null, null, 'onboarding',
      ${{ trip_state_actions: true, intakeShare: true }}
    )
  `;
  await db`
    insert into trip_things (id, trip_id, category, title, metadata, source)
    values (${existingPierId}, ${tripId}, 'activity', 'Driftwood Pier', ${{ tripState: { type: 'activity', basis: 'named', via: 'customer_named', turn: 1 } }}, 'customer')
  `;

  const searchCalls = [];
  const offlineSearch = async (args) => {
    searchCalls.push(args);
    const queryLog = [];
    return searchProactiveItinerary({
      ...args,
      env: { VK_SEARCH_WAKE_URL: 'https://vk-search.test/wake' },
      fetchImpl: createOfflineSearchFetch(queryLog),
    });
  };

  const tripRow = {
    id: tripId, customer_id: actorId, title: 'Harbor City Family Trip', destination: null,
    start_date: null, end_date: null, status: 'onboarding',
    metadata: { trip_state_actions: true, intakeShare: true },
  };
  const turn1Text = 'We are planning Harbor City with our kids ages 6 and 9 on a $2,000 budget and want a relaxed pace. We must visit Harbor Aquarium and Sunset Lighthouse and would like lodging and local seafood.';
  const turn1Things = [
    { name: 'Harbor Aquarium', kind: 'activity', when: '' },
    { name: 'Sunset Lighthouse', kind: 'park', when: '' },
  ];
  const rev1 = await prepareProactiveTripState({
    trip: tripRow, requestId: 'req-turn-1', turn: 1, actorId,
    classification: {
      ok: true, destination: 'Harbor City', hasDates: false, startDate: '', endDate: '',
      things: turn1Things,
      planningParty: 'our kids ages 6 and 9',
      planningWants: [{ category: 'hotel', value: 'lodging' }, { category: 'restaurant', value: 'local seafood' }],
      roster: [{ name: 'Maya', role: 'owner', age: null }, { name: 'Leo', role: 'child', age: 6 }, { name: 'Nora', role: 'child', age: 9 }],
    },
    text: turn1Text, history: [], wantedThings: turn1Things,
    env: {}, pool, searchImpl: offlineSearch,
  });
  assert.ok(rev1);
  const state1 = JSON.parse(rev1.state_json);
  assert.equal(validate(state1), true, ajv.errorsText(validate.errors));
  assert.equal(searchCalls.length, 0);
  assert.equal(state1.research.state, 'waiting');
  assert.deepEqual(state1.next_steps[0].missing_inputs, ['dates']);
  assert.equal(state1.last_actions.length, 0);
  assert.equal(state1.disclosed.budget?.value, '$2,000');
  assert.ok(state1.disclosed.pace?.value.includes('relaxed'));
  assert.equal((await db`select * from vacation_trip_state_action_receipts where trip_id = ${tripId}`).length, 0);

  const historyForTurn2 = [{ turn: 1, text: turn1Text, things: turn1Things }];
  const turn2Text = 'Let us go May 5 to May 8, 2028.';
  const rev2 = await prepareProactiveTripState({
    trip: tripRow, requestId: 'req-turn-2', turn: 2, actorId,
    classification: {
      ok: true, destination: 'Harbor City', hasDates: true, startDate: '2028-05-05', endDate: '2028-05-08',
      things: [], roster: [],
    },
    text: turn2Text, history: historyForTurn2, wantedThings: [],
    env: {}, pool, searchImpl: offlineSearch,
  });
  assert.ok(rev2);
  const state2 = JSON.parse(rev2.state_json);
  assert.equal(validate(state2), true, ajv.errorsText(validate.errors));
  assert.equal(searchCalls.length, 1);
  assert.ok(searchCalls[0].criteria.some((entry) => entry.includes('6') && entry.includes('9')));
  assert.ok(searchCalls[0].criteria.some((entry) => entry.includes('$2,000')));
  assert.ok(searchCalls[0].criteria.some((entry) => entry.includes('easy pace')));

  const receiptsAfterTurn2 = await db`select operation_key, record from vacation_trip_state_action_receipts where trip_id = ${tripId}`;
  assert.equal(receiptsAfterTurn2.length, 1);
  assert.equal(receiptsAfterTurn2[0].record.authority, 'system_plan');
  assert.equal(receiptsAfterTurn2[0].record.outcome.result, 'applied');
  assert.equal(state2.last_actions.length, 1);
  assert.equal(state2.last_actions[0].op, 'save_plan');
  assert.ok(state2.research.key && state2.research.state === 'complete');
  assert.ok(Object.keys(state2.candidates).length >= 3);

  const dayEntries2 = Object.values(state2.saved.days).sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(dayEntries2.map((day) => day.date), ['2028-05-05', '2028-05-06', '2028-05-07', '2028-05-08']);
  for (const day of dayEntries2) {
    assert.ok(day.assigned.length >= 1, `expected placement on ${day.date}`);
    assert.ok(day.assigned.length <= 2, `expected doable pace on ${day.date}, got ${day.assigned.length}`);
    for (const row of day.assigned) {
      assert.equal(row.proposed_by, 'system');
      assert.equal(row.time?.precision, 'proposed');
      assert.match(row.time?.value || '', /^(?:[01]\d|2[0-3]):[0-5]\d$/);
    }
  }
  const assignedTitles2 = new Set(
    dayEntries2.flatMap((day) => day.assigned.map((row) => state2.saved.items[row.item]?.title)),
  );
  for (const mustDo of ['Harbor Aquarium', 'Sunset Lighthouse', 'Driftwood Pier']) {
    assert.ok(assignedTitles2.has(mustDo), `missing customer must-do: ${mustDo}`);
  }
  assert.equal(Object.keys(state2.saved.lodging).length, 1);

  assert.equal(hasProactiveFirstPassAction(state2), true);
  const pinned2 = pinTripStateContext(rev2, { customerTurn: turn2Text });
  const chatCall2 = buildTripStateChatCall({ tripStateContext: pinned2, customerTurn: turn2Text, mode: 'write' });
  const systemText2 = chatCall2.messages[0].content.map((part) => part.text).join('\n');
  assert.ok(systemText2.includes(TRIP_STATE_PROACTIVE_PLAN_INSTRUCTION));

  const modelPayloads = [];
  const modelWrittenReply = 'I put together a first draft across May 5 to May 8 with Harbor Aquarium, Sunset Lighthouse, Driftwood Pier, and Bayview Inn, and you can tweak any stop or time whenever you like.';
  const liveReply = await withMockFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    if (new URL(url).pathname.endsWith('/decisions')) {
      return Response.json({
        answers: {
          overall_quality: { score: 5 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' },
          claims_mutation: { noul: 0.96 }, change_claim_grounded: { noul: 0.99 },
          route_type: { choice: 'itinerary_advice' }, needs_day_for_note: { noul: 0.05 },
        },
      });
    }
    modelPayloads.push(body);
    return Response.json({ model: body.model, choices: [{ message: { content: modelWrittenReply } }] });
  }, () => produceLiveAppReply({
    customerTurn: turn2Text,
    session: { trip_id: tripId, customer_id: actorId, display_name: 'Maya' },
    priorTurns: [], trip: tripRow, tripStateRevision: rev2,
    env: { OPENROUTER_API_KEY: 'offline-test-key' }, understanding: BASE_INTENT,
  }));
  assert.equal(liveReply.reply, modelWrittenReply);
  assert.equal(modelPayloads.length, 1);
  assert.ok(modelPayloads[0].messages[0].content.map((part) => part.text).join('\n').includes(TRIP_STATE_PROACTIVE_PLAN_INSTRUCTION));

  const totalAssignments2 = dayEntries2.reduce((sum, day) => sum + day.assigned.length, 0);
  const rev2Replay = await prepareProactiveTripState({
    trip: tripRow, requestId: 'req-turn-2', turn: 2, actorId,
    classification: {
      ok: true, destination: 'Harbor City', hasDates: true, startDate: '2028-05-05', endDate: '2028-05-08',
      things: [], roster: [],
    },
    text: turn2Text, history: historyForTurn2, wantedThings: [],
    env: {}, pool, searchImpl: offlineSearch,
  });
  assert.equal(rev2Replay.revision, rev2.revision);
  assert.equal(searchCalls.length, 1);

  const rev3 = await prepareProactiveTripState({
    trip: tripRow, requestId: 'req-turn-3', turn: 3, actorId,
    classification: { ok: true, destination: 'Harbor City', hasDates: false, startDate: '', endDate: '', things: [], roster: [] },
    text: 'Looks good so far, can we move Harbor Aquarium to 11:00 AM?',
    history: [...historyForTurn2, { turn: 2, text: turn2Text, things: [] }],
    wantedThings: [], env: {}, pool, searchImpl: offlineSearch,
  });
  const state3 = JSON.parse(rev3.state_json);
  assert.equal(validate(state3), true, ajv.errorsText(validate.errors));
  assert.equal(searchCalls.length, 1);
  assert.equal(state3.last_actions.length, 0);
  assert.equal(hasProactiveFirstPassAction(state3), false);
  const chatCall3 = buildTripStateChatCall({ tripStateContext: pinTripStateContext(rev3, { customerTurn: 'Looks good so far.' }), customerTurn: 'Looks good so far.', mode: 'write' });
  assert.equal(chatCall3.messages[0].content.map((part) => part.text).join('\n').includes(TRIP_STATE_PROACTIVE_PLAN_INSTRUCTION), false);
  const totalAssignments3 = Object.values(state3.saved.days).reduce((sum, day) => sum + day.assigned.length, 0);
  assert.equal(totalAssignments3, totalAssignments2);
  assert.equal((await db`select * from vacation_trip_state_action_receipts where trip_id = ${tripId}`).length, 1);

  const aquariumId = Object.entries(state3.saved.items).find(([, item]) => item.title === 'Harbor Aquarium')[0];
  const aquariumDayId = Object.entries(state3.saved.days).find(([, day]) => day.assigned.some((row) => row.item === aquariumId))[0];
  const editExecutor = createTripStateActions({ env: {}, store: createTripStateActionStore({ env: {}, pool }) });
  const editText = 'Move Harbor Aquarium to 11:00 AM.';
  const editCmd = { item: aquariumId, day: aquariumDayId, role: 'visit', time: { value: '11:00', precision: 'exact' }, time_evidence: 'clock' };
  const edited = await editExecutor.execute({
    context: {
      trip: tripRow, tripId, actorId, requestId: 'req-edit-3', operationKey: 'edit-aq', turn: 3,
      state: state3, siteRevision: state3.saved.site_revision, customerText: editText,
      authority: {
        source: 'customer',
        commands: [{ op: 'place_on_day', args: editCmd }],
        spans: { clock: { kind: 'time', start: 24, end: 32 } },
      },
    },
    op: 'place_on_day',
    args: editCmd,
  });
  assert.equal(edited.status.result, 'applied');
  const editedOccurrence = edited.state.saved.days[aquariumDayId].assigned.find((row) => row.item === aquariumId);
  assert.equal(editedOccurrence.proposed_by, 'customer');
  assert.deepEqual(editedOccurrence.time, { value: '11:00', precision: 'exact' });

  const turn4Text = 'Actually, let us move the trip to May 12 to May 15, 2028.';
  const rev4 = await prepareProactiveTripState({
    trip: tripRow, requestId: 'req-turn-4', turn: 4, actorId,
    classification: {
      ok: true, destination: 'Harbor City', hasDates: true, startDate: '2028-05-12', endDate: '2028-05-15',
      things: [], roster: [],
    },
    text: turn4Text,
    history: [...historyForTurn2, { turn: 2, text: turn2Text, things: [] }],
    wantedThings: [], env: {}, pool, searchImpl: offlineSearch,
  });
  const state4 = JSON.parse(rev4.state_json);
  assert.equal(validate(state4), true, ajv.errorsText(validate.errors));
  assert.equal(searchCalls.length, 2);
  assert.notEqual(state4.research.key, state2.research.key);
  const receiptsAfterTurn4 = await db`select operation_key, record from vacation_trip_state_action_receipts where trip_id = ${tripId} and request_id = 'req-turn-4'`;
  assert.equal(receiptsAfterTurn4.length, 1);
  assert.equal(receiptsAfterTurn4[0].record.authority, 'system_plan');
  assert.equal(state4.last_actions.length, 1);
  assert.equal(state4.last_actions[0].op, 'save_plan');
  const dayEntries4 = Object.values(state4.saved.days).sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(dayEntries4.map((day) => day.date), ['2028-05-12', '2028-05-13', '2028-05-14', '2028-05-15']);
  for (const day of dayEntries4) {
    assert.ok(day.assigned.length >= 1, `expected placement on replanned ${day.date}`);
    for (const row of day.assigned) {
      assert.equal(row.proposed_by, 'system');
      assert.equal(row.time?.precision, 'proposed');
    }
  }
  const assignedTitles4 = new Set(
    dayEntries4.flatMap((day) => day.assigned.map((row) => state4.saved.items[row.item]?.title)),
  );
  for (const mustDo of ['Harbor Aquarium', 'Sunset Lighthouse', 'Driftwood Pier']) {
    assert.ok(assignedTitles4.has(mustDo), `missing must-do after date change: ${mustDo}`);
  }

  const rev5 = await prepareProactiveTripState({
    trip: tripRow, requestId: 'req-turn-5', turn: 5, actorId,
    classification: { ok: true, destination: 'Harbor City', hasDates: false, startDate: '', endDate: '', things: [], roster: [] },
    text: 'Thanks, those May 12 to May 15 dates look great.',
    history: historyForTurn2, wantedThings: [], env: {}, pool, searchImpl: offlineSearch,
  });
  const state5 = JSON.parse(rev5.state_json);
  assert.equal(validate(state5), true, ajv.errorsText(validate.errors));
  assert.equal(searchCalls.length, 2);
  assert.equal(state5.last_actions.length, 0);
  const totalAssignments4 = dayEntries4.reduce((sum, day) => sum + day.assigned.length, 0);
  const totalAssignments5 = Object.values(state5.saved.days).reduce((sum, day) => sum + day.assigned.length, 0);
  assert.equal(totalAssignments5, totalAssignments4);

  await db`
    insert into trips (id, customer_id, title, destination, start_date, end_date, status, metadata)
    values (
      ${offTripId}, ${actorId}, 'Off Switch Trip', 'Harbor City', '2028-05-05', '2028-05-08', 'onboarding',
      ${{ trip_state_actions: false, intakeShare: true }}
    )
  `;
  const offTrip = {
    id: offTripId, customer_id: actorId, title: 'Off Switch Trip', destination: 'Harbor City',
    start_date: '2028-05-05', end_date: '2028-05-08', status: 'onboarding',
    metadata: { trip_state_actions: false, intakeShare: true },
  };
  const offResult = await prepareProactiveTripState({
    trip: offTrip, requestId: 'req-off-1', turn: 1, actorId,
    classification: {
      ok: true, destination: 'Harbor City', hasDates: true, startDate: '2028-05-05', endDate: '2028-05-08',
      things: turn1Things, roster: [],
    },
    text: turn1Text, history: [], wantedThings: turn1Things,
    env: {}, pool, searchImpl: async () => assert.fail('switch off must not call search'),
  });
  assert.equal(offResult, null);
  assert.equal((await db`select * from trip_things where trip_id = ${offTripId}`).length, 0);
  assert.equal((await db`select * from vacation_trip_state_action_receipts where trip_id = ${offTripId}`).length, 0);
  assert.deepEqual(await listTripStateRevisions(offTripId, db), []);
} finally {
  useNominatimStore(null);
  await raw.close();
}

console.log('Trip State proactive itinerary tests passed.');
