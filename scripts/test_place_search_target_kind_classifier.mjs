#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  classifyTripIntake,
  tripIntakeExtractionJsonSchema,
} from '../src/vacation/trip-intake-classify.mjs';
import { intakePlaceSearchTargetKindError } from '../src/vacation/place-search-target-kind.mjs';

const schema = tripIntakeExtractionJsonSchema().json_schema.schema;
assert.equal(schema.properties.targetKind.enum.join(','), 'named_place,category,');
assert.equal(schema.required.includes('targetKind'), true);

assert.equal(intakePlaceSearchTargetKindError({ turnKind: 'place_search', targetKind: 'named_place' }), '');
assert.equal(intakePlaceSearchTargetKindError({ turnKind: 'place_search', targetKind: 'category' }), '');
assert.match(
  intakePlaceSearchTargetKindError({ turnKind: 'place_search', targetKind: '' }),
  /targetKind required/,
);
assert.match(
  intakePlaceSearchTargetKindError({ turnKind: 'place_search', targetKind: 'venue' }),
  /targetKind unknown/,
);
assert.equal(intakePlaceSearchTargetKindError({ turnKind: 'other', targetKind: '' }), '');

const env = { OPENROUTER_API_KEY: 'test-key', JEV_ROUTER_MODEL: 'test/jev-router' };

function classifyFetch(content) {
  return async (url) => {
    if (String(url).includes('/decisions')) {
      return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.1 } } }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
}

const missingTargetKind = await classifyTripIntake({
  text: 'save Paia Fish Market',
  env,
  fetchImpl: classifyFetch(JSON.stringify({
    turnKind: 'place_search',
    target: 'Paia Fish Market',
    anchor: 'Kihei',
    anchorIsLodging: true,
    category: 'restaurant',
    targetKind: '',
    question: '',
    things: [],
    roster: [],
    inviteeName: '',
    inviteeEmail: '',
    destination: 'Maui',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
  })),
});
assert.equal(missingTargetKind.ok, false);
assert.match(missingTargetKind.error, /targetKind required/);

const okNamed = await classifyTripIntake({
  text: 'save Paia Fish Market',
  env,
  fetchImpl: classifyFetch(JSON.stringify({
    turnKind: 'place_search',
    target: 'Paia Fish Market',
    anchor: 'Kihei',
    anchorIsLodging: true,
    category: 'restaurant',
    targetKind: 'named_place',
    question: '',
    things: [],
    roster: [],
    inviteeName: '',
    inviteeEmail: '',
    destination: 'Maui',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
  })),
});
assert.equal(okNamed.ok, true);
assert.equal(okNamed.targetKind, 'named_place');

console.log('test_place_search_target_kind_classifier: ok');
