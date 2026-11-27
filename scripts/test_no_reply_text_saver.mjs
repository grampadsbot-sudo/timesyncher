import assert from 'node:assert/strict';
import { attachIntakeItineraryFromReply } from '../routes/vacation-itinerary.mjs';
import { plannedCustomerThings } from '../src/vacation/chat-plan-persist.mjs';
import { persistQueuedIntakeLodgingFromWanted } from '../src/vacation/intake-lodging-queue-persist.mjs';

const dates = { start_date: '2027-04-05', end_date: '2027-04-09' };
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
    if (sql.startsWith('select start_date, end_date from trips')) return [dates];
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

const place = 'Harbor Lighthouse Museum';
const reply = ['Day 5', 'Nobody has paid yet', 'We will see the aquarium first', 'Depart at 07:45', place].join('\n');
const history = [{ speaker: 'app', body: reply }];

const noWrites = tripDb({ history });
await record(noWrites.db, 'Please explain how the itinerary works.', reply);
await record(noWrites.db, 'Yes, save that plan.', 'Saved.');
assert.deepEqual(noWrites.state.inserted, []);
assert.equal(noWrites.state.historyReads, 0);

const legacy = tripDb({ history });
await record(legacy.db, 'Yes, save that plan.', 'Saved.', { env: disabled });
assert.equal(legacy.state.historyReads, 1);
assert.deepEqual(legacy.state.inserted.map(({ title }) => title), [place]);

const named = tripDb({ history });
const mistakenLodging = [{ name: 'The shuttle has reached Crescent Bay Inn', kind: 'hotel' }];
for (const env of [disabled, enabled]) {
  assert.equal(await persistQueuedIntakeLodgingFromWanted(named.db, tripId, mistakenLodging, { env }), null);
}
await record(named.db, 'Day 1: Crescent Bay Inn\nDay 2: the Sunset Pier Diner\nDay 3: SUNSET PIER DINER!', reply, {}, mistakenLodging);
await record(named.db, 'Day 4: THE CRESCENT BAY INN.', reply);
await record(named.db, 'Add a harbor picnic.', reply);
assert.deepEqual(named.state.inserted.map(({ title }) => title), ['Crescent Bay Inn', 'the Sunset Pier Diner', 'harbor picnic']);
assert.equal(named.state.inserted[0].category, 'hotel');

const titleChecks = [
  'Day 5', 'Nobody has paid yet', 'Museum doors are locked', 'The guide opened the gate',
  'I toured the aquarium', 'Can Cedar Hall fit us', 'Will the ferry run', 'Museum closed. Take the ferry.', 'Departure at 07:45',
  'A name with far too many words to fit in a single itinerary title',
  'St. Elmo Gallery', 'On the Waterfront Café', 'Will Calder Museum of Art',
].join('\n');
for (const env of [disabled, enabled]) {
  assert.deepEqual((await plannedCustomerThings(named.db, tripId, titleChecks, '', [], { env }))
    .map(({ title }) => title), ['St. Elmo Gallery', 'On the Waterfront Café', 'Will Calder Museum of Art']);
}

const savedHotel = named.state.inserted[0];
const datedNote = 'Crescent Bay Inn on Friday April ninth works for us.';
const savedDate = savedHotel.starts_at;
const savedNotes = [...savedHotel.metadata.notes];
await record(named.db, datedNote, reply, { activityCommitDecisionsImpl: async () => assert.fail('legacy date inference ran') });
assert.equal(savedHotel.starts_at, savedDate);
assert.equal(savedHotel.metadata.customerWhen, dates.start_date);
assert.deepEqual(savedHotel.metadata.notes, [...savedNotes, datedNote]);

console.log('no reply text saver passed');
