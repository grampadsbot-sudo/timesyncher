import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const from = html.indexOf('function customerPlaceName(');
const to = html.indexOf('function realVacations(');
assert.ok(from >= 0 && to > from, 'dropdown helpers found in vacation-app.html');

const load = new Function('safe', 'icon', `${html.slice(from, to)}; return { tripDates, tripBadge, vacationSelector };`);
const { tripDates, tripBadge, vacationSelector } = load(String, { chevron: '', check: '' });

const enums = ['shared_ready', 'onboarding', 'draft', 'active', 'Vacation'];
const dated = { id: 'a', title: 'Paris, France', status: 'shared_ready', startDate: '2026-11-11', endDate: '2026-11-14' };
const undated = { id: 'b', title: 'Rome', status: 'onboarding' };

const markup = vacationSelector([dated, undated], dated);
const options = markup.split('class="trip-option').slice(1);
assert.equal(options.length, 2);
assert.match(options[0], /<small>Nov 11–14 2026<\/small>/);
assert.doesNotMatch(options[1], /<small>/);
for (const word of ['shared_ready', 'onboarding']) assert.ok(!markup.includes(word), `${word} never rendered`);
assert.doesNotMatch(markup, /<small>Vacation<\/small>/);

assert.equal(tripDates(dated), 'Nov 11–14 2026');
assert.equal(tripDates({ startDate: '2026-11-28', endDate: '2026-12-02' }), 'Nov 28–Dec 2 2026');
assert.equal(tripDates({ startDate: '2026-12-30', endDate: '2027-01-02' }), 'Dec 30 2026–Jan 2 2027');
assert.equal(tripDates(undated), '');
assert.equal(tripDates({ startDate: '2026-11-11' }), '');
assert.equal(tripDates(null), '');
for (const status of enums) {
  assert.equal(tripDates({ status }), '', `${status} returns blank without dates`);
  assert.equal(tripDates({ status, startDate: status, endDate: status }), '', `${status} is not a date`);
}

assert.equal(tripBadge(dated), 'Paris Nov 11–14 2026');
assert.equal(tripBadge(undated), 'Rome');
assert.equal(tripBadge({ startDate: '2026-11-11', endDate: '2026-11-14' }), 'Nov 11–14 2026');

console.log('test_trip_dropdown_human_status_848: ok');
