import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sayVacationNotTrip } from '../src/vacation/customer-visible-copy.mjs';

const ship = readFileSync(new URL('../src/vacation/reply-ship.mjs', import.meta.url), 'utf8');
assert.match(ship, /produced\.reply = sayVacationNotTrip\(produced\.reply\)/);
assert.match(ship, /reply: sayVacationNotTrip\(finished\.reply\)/);

assert.equal(
  sayVacationNotTrip('Your Monterey Summer Escape trip to Monterey is being built.'),
  'Your Monterey Summer Escape vacation to Monterey is being built.',
);
assert.equal(sayVacationNotTrip('Two trips, one Trip, and TRIPS.'), 'Two vacations, one Vacation, and VACATIONS.');
assert.equal(
  sayVacationNotTrip('See https://www.trip.com/hotel and a trip.com note.'),
  'See https://www.trip.com/hotel and a trip.com note.',
);
assert.equal(sayVacationNotTrip('day-by-day itinerary'), 'day-by-day itinerary');
assert.equal(sayVacationNotTrip(''), '');

console.log('test_say_vacation_not_trip ok');
