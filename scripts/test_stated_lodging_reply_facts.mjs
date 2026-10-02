#!/usr/bin/env node
import assert from 'node:assert/strict';
import { enrichDraftingTripContext } from './reply-trip-context-facts.mjs';
import { statedLodgingLabelFromThings } from '../src/vacation/intake-shared-trip.mjs';

const KIHEI = 'Kihei Kai Nani';
const things = [{
  title: KIHEI,
  category: 'hotel',
  metadata: { customerStatedLodging: true, source: 'customer_stated' },
}];

assert.equal(statedLodgingLabelFromThings(things), KIHEI);

const tripContext = await enrichDraftingTripContext({ itinerary: [] }, { things, session: null, env: {} });
assert.equal(tripContext.lodging, KIHEI);

console.log('test_stated_lodging_reply_facts: ok');
