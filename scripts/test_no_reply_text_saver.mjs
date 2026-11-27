import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attachIntakeItineraryFromReply } from '../routes/vacation-itinerary.mjs';
import { plannedCustomerThings } from '../src/vacation/chat-plan-persist.mjs';
import { persistQueuedIntakeLodgingFromWanted } from '../src/vacation/intake-lodging-queue-persist.mjs';

const site = JSON.parse(await readFile(new URL('./fixtures/harness/lopez-reply-saver-site.redacted.json', import.meta.url), 'utf8'));
const enabled = { VK_TRIP_STATE_ACTIONS: '1' };
const disabled = { VK_TRIP_STATE_ACTIONS: '0' };
const tripId = 'offline-reply-saver';

function tripDb({ history = [], things = [] } = {}) {
  const state = { things: [...things], inserted: [], historyReads: 0 };
  const db = async (strings, ...values) => {
    const sql = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (sql.includes('from transcript_turns')) {
      state.historyReads += 1;
      return history;
    }
    if (sql.startsWith('select start_date, end_date from trips')) return [site.trip];
    if (sql.startsWith('select metadata from trips')) return [{ metadata: {} }];
    if (sql.startsWith('select count(*)::int as n from trip_things')) return [{ n: state.things.length }];
    if (sql.startsWith('select ') && sql.includes('from trip_things')) return state.things;
    if (sql.startsWith('insert into trip_things')) {
      const row = {
        id: `thing-${state.things.length + 1}`,
        title: values[4],
        category: values[2],
        starts_at: values[6],
        metadata: JSON.parse(values[13]),
      };
      state.things.push(row);
      state.inserted.push(row);
      return [{ id: row.id }];
    }
    if (sql.startsWith('update trip_things set metadata = coalesce(metadata')) {
      const row = state.things.find(({ id }) => id === values[1]);
      row.metadata = { ...row.metadata, ...values[0] };
      return [{ id: row.id }];
    }
    if (sql.startsWith('update trip_things set category =')) {
      const row = state.things.find(({ id }) => id === values[10]);
      row.starts_at = values[3] || row.starts_at;
      row.metadata = JSON.parse(values[7]);
      return [];
    }
    if (sql.startsWith('update trips set metadata')) return [];
    throw new Error(`Unexpected offline SQL: ${sql}`);
  };
  return { db, state };
}

function record(db, customer, appReply, options = {}, extracted = []) {
  return attachIntakeItineraryFromReply(db, tripId, customer, {
    env: enabled, appReply, ...options,
    fetchImpl: async () => assert.fail('unexpected fetch'),
    searchPlacesImpl: async () => assert.fail('unexpected place search'),
  }, '', extracted);
}

const historicDayFive = site.assignments['5'].map(({ place_id }) => site.places.find(({ id }) => id === place_id).name);
assert.deepEqual(historicDayFive, ['Nothing has been booked', 'and nothing has been emailed.']);
const reply = ['Day 5', ...historicDayFive, 'start around 8:30', 'Magic Kingdom'].join('\n');
const history = [{ speaker: 'app', body: reply }];

const noWrites = tripDb({ history });
await record(noWrites.db, 'Please explain how the itinerary works.', reply);
await record(noWrites.db, 'Yes, save that plan.', 'Saved.');
assert.deepEqual(noWrites.state.inserted, []);
assert.equal(noWrites.state.historyReads, 0);

const legacy = tripDb({ history });
await record(legacy.db, 'Yes, save that plan.', 'Saved.', { env: disabled });
assert.equal(legacy.state.historyReads, 1);
assert.deepEqual(legacy.state.inserted.map(({ title }) => title), ['Magic Kingdom']);

const named = tripDb({ history });
const hotelDayShape = site.places.find(({ id }) => id === 5);
const mistakenLodging = [{ name: hotelDayShape.name, kind: 'hotel' }];
for (const env of [disabled, enabled]) {
  assert.equal(await persistQueuedIntakeLodgingFromWanted(named.db, tripId, mistakenLodging, { env }), null);
}
await record(named.db, 'Day 1: Lake Buena Vista hotel\nDay 2: the Lake Buena Vista Hotel.', reply, {}, mistakenLodging);
await record(named.db, 'Day 3: THE LAKE BUENA VISTA HOTEL!', reply);
await record(named.db, 'Add a quiet morning walk.', reply);
assert.deepEqual(named.state.inserted.map(({ title, category }) => [title, category]), [
  ['Lake Buena Vista hotel', 'hotel'],
  ['quiet morning walk', 'activity'],
]);

const titleChecks = [
  'Day 5', ...historicDayFive, 'notes', 'them to those days', 'Purple seventy bicycle.',
  'Could you tell me more', 'No more than two stops', 'We prefer a slow day',
  'Lake Buena Vista hotel settle-in with the pool', 'quiet morning walk',
].join('\n');
assert.deepEqual((await plannedCustomerThings(named.db, tripId, titleChecks, reply, [], { env: enabled }))
  .map(({ title }) => title), ['quiet morning walk']);
const rides = site.places.filter(({ category_name }) => category_name === 'Car')
  .map(({ name }) => ({ title: name, category: 'car' }));
assert.deepEqual(await plannedCustomerThings(named.db, tripId, rides.map(({ title }) => title).join('\n'), reply, rides, { env: enabled }), rides.slice(0, 1));

const savedHotel = named.state.inserted[0];
const datedNote = 'Lake Buena Vista hotel on Friday April ninth works for us.';
const savedDate = savedHotel.starts_at;
const savedNotes = [...savedHotel.metadata.notes];
await record(named.db, datedNote, reply, { activityCommitDecisionsImpl: async () => assert.fail('legacy date inference ran') });
assert.equal(savedHotel.starts_at, savedDate);
assert.equal(savedHotel.metadata.customerWhen, site.days[0].date);
assert.deepEqual(savedHotel.metadata.notes, [...savedNotes, datedNote]);

console.log('no reply text saver passed');
