#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { turnSavedThingFields } from '../src/vacation/turn-saved-thing-ids.mjs';

const trip = {
  id: 'a8da6c05-e5b4-42d5-91fe-4dfdc91d3045',
  title: 'Maui March 10-17 2027 with my wife',
  destination: 'Maui',
  start_date: '2027-03-10',
  end_date: '2027-03-17',
};
const mamaId = '17c0eb63-c7b1-4f4b-bd19-1b45fe37cc29';
const rows = [{
  id: mamaId,
  category: 'restaurant',
  title: "Mama's Fish House",
  starts_at: '2027-03-13T12:00:00.000Z',
  metadata: { whenLabel: 'Saturday', source: 'chat_extraction', who: '' },
  location: {},
}];

const saved = turnSavedThingFields(trip, rows, [mamaId]);
assert.equal(saved.thingId, mamaId);
assert.deepEqual(saved.sharedDayIds, [532443018]);
assert.deepEqual(saved.savedThings, [{ thingId: mamaId, sharedDayIds: [532443018] }]);

const unscheduled = turnSavedThingFields(trip, [{
  ...rows[0],
  id: 'a37360ff-2283-4ffc-a649-ab746500565e',
  title: 'Paia Fish Market South Side',
  starts_at: null,
  metadata: { whenLabel: '', source: 'brave' },
}], ['a37360ff-2283-4ffc-a649-ab746500565e']);
assert.equal(unscheduled.thingId, 'a37360ff-2283-4ffc-a649-ab746500565e');
assert.deepEqual(unscheduled.sharedDayIds, []);

const none = turnSavedThingFields(trip, rows, []);
assert.equal(none.thingId, null);
assert.deepEqual(none.sharedDayIds, []);
assert.deepEqual(none.savedThings, []);

const route = readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(route, /returning id/);
assert.match(route, /savedThingIds/);
const ship = readFileSync(new URL('../src/vacation/reply-ship.mjs', import.meta.url), 'utf8');
assert.match(ship, /thingId: savedFields\.thingId/);
assert.match(ship, /sharedDayIds: savedFields\.sharedDayIds/);

console.log(JSON.stringify({
  ok: true,
  checked: 'saved-thing-turn-ids',
  thingId: saved.thingId,
  sharedDayIds: saved.sharedDayIds,
}));
