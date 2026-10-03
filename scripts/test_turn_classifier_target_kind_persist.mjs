#!/usr/bin/env node
import assert from 'node:assert/strict';
import { stampTurnClassifier } from '../src/vacation/in-turn-search-telemetry.mjs';

const payload = {};
const customerLive = {};
const classification = {
  ok: true,
  turnKind: 'place_search',
  targetKind: 'named_place',
  category: 'restaurant',
  routerModel: 'test/model',
};

const stamped = stampTurnClassifier(payload, customerLive, classification);
assert.equal(stamped.targetKind, 'named_place');
assert.equal(stamped.category, 'restaurant');
assert.equal(payload.turnClassifier.targetKind, 'named_place');
assert.equal(payload.turnClassifier.category, 'restaurant');
assert.equal(customerLive.turnClassifier.targetKind, 'named_place');
assert.equal(customerLive.turnClassifier.category, 'restaurant');

const failedPayload = {};
const failedLive = {};
stampTurnClassifier(failedPayload, failedLive, {
  ok: false,
  turnKind: 'place_search',
  targetKindRaw: 'named_place',
  categoryRaw: 'food',
  error: 'trip intake place_search extraction category unknown',
});
assert.equal(failedPayload.turnClassifier.targetKind, 'named_place');
assert.equal(failedPayload.turnClassifier.categoryRaw, 'food');

console.log('test_turn_classifier_target_kind_persist: ok');
