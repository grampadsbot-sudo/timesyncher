import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tripStateActionsEnabled } from '../src/vacation/trip-state-actions-enabled.mjs';
import { plannedCustomerThings } from '../src/vacation/chat-plan-persist.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const off = {};
const onEnv = { VK_TRIP_STATE_ACTIONS: '1' };

assert.equal(tripStateActionsEnabled({ env: off }), false);
assert.equal(tripStateActionsEnabled({ env: onEnv }), true);
assert.equal(tripStateActionsEnabled({ env: { VK_TRIP_STATE_ACTIONS: 'true' } }), true);

const flaggedTrip = { metadata: { trip_state_actions: true } };
const stringFlagTrip = { metadata: { trip_state_actions: 'true' } };
const plainTrip = { metadata: { intakeShare: true } };
const otherTrip = { metadata: {} };

assert.equal(tripStateActionsEnabled({ env: off, trip: flaggedTrip }), true);
assert.equal(tripStateActionsEnabled({ env: off, trip: stringFlagTrip }), true);
assert.equal(tripStateActionsEnabled({ env: off, trip: plainTrip }), false);
assert.equal(tripStateActionsEnabled({ env: off, trip: otherTrip }), false);
assert.equal(tripStateActionsEnabled({ env: off, trip: { metadata: { trip_state_actions: '1' } } }), false);
assert.equal(tripStateActionsEnabled({ env: off, trip: { metadata: { trip_state_actions: false } } }), false);
assert.equal(tripStateActionsEnabled({ env: onEnv, trip: otherTrip }), true);

const dates = { start_date: '2028-03-01', end_date: '2028-03-05' };
function planDb() {
  return async (strings, ...values) => {
    const sql = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (sql.startsWith('select start_date, end_date from trips')) return [dates];
    if (sql.includes('from transcript_turns')) return [];
    throw new Error(`unexpected sql: ${sql}`);
  };
}

const corpus = 'Day 2: Willow Creek Trail\nDay 3: Mapleton Herb Garden';
const flaggedOnly = await plannedCustomerThings(planDb(), 'trip-willow-flag', corpus, 'Day 2: Hidden Falls Overlook', [], {
  env: off,
  trip: flaggedTrip,
});
const envOnly = await plannedCustomerThings(planDb(), 'trip-mapleton-env', corpus, 'Day 2: Hidden Falls Overlook', [], {
  env: onEnv,
  trip: otherTrip,
});
const bothOff = await plannedCustomerThings(planDb(), 'trip-plain-off', corpus, 'Day 2: Hidden Falls Overlook', [], {
  env: off,
  trip: otherTrip,
});

assert.deepEqual(flaggedOnly.map(({ title }) => title), ['Willow Creek Trail', 'Mapleton Herb Garden']);
assert.deepEqual(envOnly.map(({ title }) => title), flaggedOnly.map(({ title }) => title));
assert.deepEqual(bothOff.map(({ title }) => title), ['Willow Creek Trail', 'Mapleton Herb Garden', 'Hidden Falls Overlook']);

const promptHash = createHash('sha256')
  .update(replyRulesSystem({}, '', 'Spring trip', false, 'Please save Botanical Gardens.', { VK_TRIP_STATE_ACTIONS: '0' })).digest('hex');
assert.equal(promptHash, '51a721073433d0ee64458c9e1a98f8cbdd576b5c7ede120ddb13d846b7a04170');

console.log('trip state per-trip flag tests passed');