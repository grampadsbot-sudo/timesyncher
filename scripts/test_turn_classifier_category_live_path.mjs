#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runVacationAppInTurnSearch } from '../src/vacation/chat-place-search.mjs';
import { stampTurnClassifier } from '../src/vacation/in-turn-search-telemetry.mjs';

const COFFEE_CLASSIFICATION = {
  ok: true,
  turnKind: 'place_search',
  targetKind: 'category',
  category: 'restaurant',
  target: 'coffee shops',
  anchor: 'Kihei',
  anchorIsLodging: false,
  routerModel: 'typesafe/jev-1.13',
};

const TACOS_CLASSIFICATION = {
  ok: true,
  turnKind: 'place_search',
  targetKind: 'category',
  category: 'restaurant',
  target: 'tacos',
  anchor: '200 Nohea Kai Dr, Lahaina, HI 96761',
  anchorIsLodging: true,
  routerModel: 'typesafe/jev-1.13',
};

const coffeePayload = {};
const coffeeLive = {};
stampTurnClassifier(coffeePayload, coffeeLive, COFFEE_CLASSIFICATION);
assert.equal(coffeePayload.turnClassifier.category, 'restaurant');
assert.equal(coffeePayload.turnClassifier.targetKind, 'category');
assert.equal(coffeePayload.turnClassifier.turnKind, 'place_search');

const tacosPayload = {};
const tacosLive = {};
stampTurnClassifier(tacosPayload, tacosLive, TACOS_CLASSIFICATION);
assert.equal(tacosPayload.turnClassifier.category, 'restaurant');
assert.equal(tacosPayload.turnClassifier.targetKind, 'category');

let updatedPayload = null;
const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (text.includes('update transcript_turns')) {
    updatedPayload = values[0];
    return [];
  }
  return [];
};

const missingCategory = await runVacationAppInTurnSearch({
  db,
  tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  requestId: 'req-missing-category',
  customerTurn: 'coffee shops near Kihei',
  tripDestination: 'Maui',
  classification: {
    ...COFFEE_CLASSIFICATION,
    category: '',
  },
  payload: {},
  customerLive: {},
  turnId: 'turn-missing-category',
  placeSearchTurn: true,
  searchImpl: async () => {
    throw new Error('search must not run when place_search category is missing');
  },
});

assert.equal(missingCategory.ok, false);
assert.equal(missingCategory.status, 'turn_classifier_failed');
assert.match(String(missingCategory.error), /classification category missing/i);
assert.equal(missingCategory.placeSearch?.error, 'turn_classifier_failed');
assert.match(String(missingCategory.placeSearch?.reason), /classification category missing/i);
assert.equal(updatedPayload?.turnClassifier?.category, null);
assert.equal(updatedPayload?.turnClassifier?.turnKind, 'place_search');

console.log('test_turn_classifier_category_live_path: ok');
