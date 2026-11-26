#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  customerNamedActivity,
  intakeThingHasProperName,
  mergeWantedThings,
  namedCustomerActivities,
  thingsFromIntake,
} from '../src/vacation/trip-intake-classify.mjs';
import { INTAKE_PROVENANCE_TEST_OPTIONS, thingWithFixtureProvenance } from './fixtures/intake-provenance-test-context.mjs';

const line = 'Add a quiet morning walk and keep the afternoon open.';
const named = customerNamedActivity(line);
assert.equal(named.title, 'quiet morning walk');
assert.equal(named.source, 'customer');
assert.equal(customerNamedActivity('We are planning a short Hilo stay from March 4 to March 8 2027. Keep the days light.'), null);
assert.equal(customerNamedActivity('Add a collaborator'), null);

assert.equal(intakeThingHasProperName('museum morning'), false);
assert.equal(intakeThingHasProperName('taco spots'), false);
assert.equal(intakeThingHasProperName('mid-range options'), false);
assert.deepEqual(thingsFromIntake([
  thingWithFixtureProvenance({ name: 'museum morning', kind: 'activity' }),
  thingWithFixtureProvenance({ name: 'taco spots', kind: 'restaurant' }),
  thingWithFixtureProvenance({ name: 'mid-range options', kind: 'hotel' }),
], INTAKE_PROVENANCE_TEST_OPTIONS).map((thing) => thing.title), []);

const saved = mergeWantedThings([], namedCustomerActivities(line, []));
assert.deepEqual(saved.map((thing) => thing.title), ['quiet morning walk']);
assert.deepEqual(mergeWantedThings([], namedCustomerActivities('Keep the afternoon open.', [
  { name: 'museum morning', kind: 'activity' },
])).map((thing) => thing.title), []);

const route = fs.readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(route, /namedCustomerActivities\(text, intakeActivityThings\(extracted\)\)/);
const harness = fs.readFileSync(new URL('./harness/runtime.mjs', import.meta.url), 'utf8');
assert.match(harness, /no-thing-after-chat/);
assert.match(harness, /chatLeftNoThing/);

console.log('test_acceptance_1039_named_activity: ok');
