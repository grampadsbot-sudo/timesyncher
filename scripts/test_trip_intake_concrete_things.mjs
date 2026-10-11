import assert from 'node:assert/strict';

import { assignDates } from '../src/vacation/intake-shared-trip.mjs';
import {
  intakeThingHasProperName,
  mergeWantedThings,
  thingsFromIntake,
} from '../src/vacation/trip-intake-classify.mjs';

assert.equal(intakeThingHasProperName('mid-range options'), false);
assert.equal(intakeThingHasProperName('taco spots'), false);
assert.equal(intakeThingHasProperName('museum morning'), false);
assert.equal(intakeThingHasProperName('Zephyr Pavilion'), true);
assert.equal(intakeThingHasProperName('North Market Hall'), true);
assert.equal(intakeThingHasProperName('42 Maple Walk'), true);

const generic = thingsFromIntake([
  { name: 'mid-range options', kind: 'hotel', who: '', when: '' },
  { name: 'taco spots', kind: 'restaurant', who: '', when: '' },
  { name: 'Zephyr Pavilion', kind: 'hotel', who: '', when: 'Tue Jun 9' },
  { name: 'North Market Hall', kind: 'restaurant', who: '', when: '' },
]);
assert.deepEqual(generic.map((thing) => thing.title), ['Zephyr Pavilion', 'North Market Hall']);
assert.equal(generic[0].whenLabel, 'Tue Jun 9');
assert.equal(generic[1].whenLabel, '');

const merged = mergeWantedThings([], [
  { name: 'mid-range options', kind: 'hotel' },
  { name: 'North Market Hall', kind: 'restaurant' },
]);
assert.deepEqual(merged.map((thing) => thing.title), ['North Market Hall']);

const tripDates = ['2026-06-08', '2026-06-09', '2026-06-10'];
assert.deepEqual(
  assignDates({ customerWhen: '', whenLabel: '' }, 2026, tripDates),
  [],
);
assert.deepEqual(
  assignDates({ customerWhen: '', whenLabel: 'Tue Jun 9' }, 2026, tripDates),
  ['2026-06-09'],
);

console.log('trip intake concrete things passed');
