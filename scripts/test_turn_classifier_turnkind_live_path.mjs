#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runVacationAppInTurnSearch } from '../src/vacation/chat-place-search.mjs';
import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';

function mockClassifierFetch(extraction) {
  return async (url) => {
    if (String(url).includes('/decisions')) {
      return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.1 } } }) };
    }
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(extraction) } }] }),
    };
  };
}

const farmers = await classifyTripIntake({
  text: 'farmers market near Kihei',
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl: mockClassifierFetch({
    turnKind: 'place_search',
    target: 'farmers market',
    anchor: 'Kihei',
    anchorIsLodging: false,
    category: 'market',
    targetKind: 'category',
    question: '',
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
  }),
});
assert.equal(farmers.ok, true);
assert.equal(farmers.category, 'market');
assert.equal(farmers.turnKind, 'place_search');

let updatedPayload = null;
const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (text.includes('update transcript_turns')) {
    updatedPayload = values[0];
    return [];
  }
  return [];
};

const missingTurnKind = await runVacationAppInTurnSearch({
  db,
  tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  requestId: 'req-missing-turnkind',
  customerTurn: 'farmers market near Kihei',
  tripDestination: 'Maui',
  classification: {
    ok: true,
    turnKind: '',
    targetKind: 'category',
    category: 'market',
    target: 'farmers market',
    anchor: 'Kihei',
    routerModel: 'typesafe/jev-1.13',
  },
  payload: {},
  customerLive: {},
  turnId: 'turn-missing-turnkind',
  placeSearchTurn: true,
  searchImpl: async () => {
    throw new Error('search must not run when turnKind is missing');
  },
});

assert.equal(missingTurnKind.ok, false);
assert.equal(missingTurnKind.status, 'turn_classifier_failed');
assert.match(String(missingTurnKind.error), /turnKind missing/i);
assert.equal(updatedPayload?.turnClassifier?.error, 'turn_classifier_failed');
assert.equal(String(updatedPayload?.turnClassifier?.turnKind || '').trim(), '');

console.log('test_turn_classifier_turnkind_live_path: ok');
