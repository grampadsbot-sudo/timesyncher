#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assignDates } from '../src/vacation/intake-shared-trip.mjs';

const tripDates = ['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'];
const saturdays = tripDates.filter((date) => new Date(`${date}T12:00:00.000Z`).getUTCDay() === 6);
assert.equal(saturdays.length, 1);
assert.equal(saturdays[0], '2026-03-07');

const assigned = assignDates({
  title: 'Farmers market',
  customerWhen: 'Saturday',
  whenLabel: '',
}, 2026, tripDates);
assert.deepEqual(assigned, ['2026-03-07']);

console.log('test_assign_dates_weekday: ok');
