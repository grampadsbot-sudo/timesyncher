#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  PLACE_SEARCH_CATEGORY_KEYS,
  tripIntakePlaceSearchCategorySchemaEnum,
} from '../src/vacation/place-search-category-keys.mjs';
import { tripIntakeExtractionJsonSchema } from '../src/vacation/trip-intake-classify.mjs';
import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';

const schemaEnum = tripIntakePlaceSearchCategorySchemaEnum();
assert.deepEqual(schemaEnum.slice(0, PLACE_SEARCH_CATEGORY_KEYS.length), [...PLACE_SEARCH_CATEGORY_KEYS]);
assert.equal(schemaEnum.at(-1), '');
assert.equal(schemaEnum.includes('food'), false);

const responseSchema = tripIntakeExtractionJsonSchema().json_schema.schema;
assert.deepEqual(responseSchema.properties.category.enum, schemaEnum);

const env = { OPENROUTER_API_KEY: 'test-key', JEV_ROUTER_MODEL: 'test/jev-router' };

function mockFetch(content) {
  return async (url) => {
    if (String(url).includes('/decisions')) {
      return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.1 } } }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
}

const foodFail = await classifyTripIntake({
  text: 'best tacos near Kihei',
  env,
  fetchImpl: mockFetch(JSON.stringify({
    turnKind: 'place_search',
    target: 'tacos',
    anchor: 'our hotel',
    anchorIsLodging: true,
    category: 'food',
    targetKind: 'category',
    question: '',
    things: [],
    roster: [],
    inviteeName: '',
    inviteeEmail: '',
    destination: 'Kihei',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
  })),
});
assert.equal(foodFail.ok, false);
assert.match(foodFail.error, /category unknown/i);
assert.equal(foodFail.categoryRaw, 'food');
assert.equal(foodFail.turnKind, 'place_search');

console.log('test_trip_intake_extraction_category_schema: ok');
