import assert from 'node:assert/strict';

import { activityCommits, contentTags, customerIntent, seatsFromModel } from '../src/vacation/customer-intent.mjs';
import { applyCustomerNotes } from '../src/vacation/live-app-turn.mjs';
import { payerPriceLine, payerSeats } from '../src/vacation/seat-price.mjs';
import { classifyTurn, classifyTurnWithModel } from '../src/vacation/turn-tags.mjs';
import { forecastReadings } from '../src/vacation/wind-backup.mjs';

const windy = forecastReadings([
  { name: 'Kahaluu', windMph: 22 },
  { name: 'House', windMph: 18.2 },
]);
assert.deepEqual(windy, [
  { name: 'House', windMph: 18 },
  { name: 'Kahaluu', windMph: 22 },
]);
assert.equal(JSON.stringify(windy).includes('house pool'), false);
assert.equal(JSON.stringify(windy).includes('last resort'), false);

const swim = [{ title: 'Swim', customerWhen: '', notes: [], collaboratorNotes: [] }];
const conditional = 'Tyler wants a swim on Monday April sixth if the beach is windy.';
const asked = applyCustomerNotes(swim, conditional, { commits: { [conditional]: { ask: true, commits: false } } });
assert.equal(asked[0].customerWhen, '');
const committed = applyCustomerNotes(swim, conditional, { commits: { [conditional]: { commits: true, ask: false } } });
assert.match(committed[0].customerWhen, /Mon Apr 6/);

const priceTurn = 'How much is it if Kimberly joins? I pay for Kimberly.';
process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS = '1900';
assert.equal(payerSeats(priceTurn).length, 0);
assert.equal(payerPriceLine(priceTurn), '');
assert.match(payerPriceLine(priceTurn, process.env, [{ name: 'Kimberly', payer: 'you' }]), /^Kimberly \$19, paid by you$/);

const internal = classifyTurn({ text: 'hotel in Vegas on Friday', speaker: 'customer', direction: 'inbound' });
assert.deepEqual(internal.tags, ['customer_request']);
assert.equal(internal.source, 'internal_speaker');
assert.equal(internal.tags.includes('lodging'), false);
const assistant = classifyTurn({ speaker: 'assistant', direction: 'outbound', text: 'Here is the plan' });
assert.equal(assistant.tags.includes('assistant_response'), true);

function jsonFetch(payload) {
  return async () => ({
    ok: true,
    async json() {
      return { choices: [{ message: { content: JSON.stringify(payload) } }] };
    },
  });
}

const intent = await customerIntent(priceTurn, {
  env: { OPENROUTER_API_KEY: 'test' },
  fetchImpl: jsonFetch({ asksPrice: true, asksAccess: false, pullsAccess: true, seats: [{ name: 'Kimberly', payer: 'you' }], ask: false }),
});
assert.equal(intent.asksPrice, true);
assert.deepEqual(intent.seats, [{ name: 'Kimberly', payer: 'you' }]);
assert.deepEqual(seatsFromModel([{ name: '', payer: 'you' }, { name: 'Kimberly', payer: 'you' }]), [{ name: 'Kimberly', payer: 'you' }]);

const commits = await activityCommits([conditional], {
  env: { OPENROUTER_API_KEY: 'test' },
  fetchImpl: jsonFetch({ sentences: [{ text: conditional, commits: false, ask: true }] }),
});
assert.equal(commits[conditional].commits, false);
assert.equal(commits[conditional].ask, true);

const tags = await classifyTurnWithModel(
  { text: 'Book a hotel', speaker: 'customer', direction: 'inbound' },
  { env: { OPENROUTER_API_KEY: 'test' }, fetchImpl: jsonFetch({ tags: ['lodging'], ask: false }) },
);
assert.equal(tags.source, 'model_intent');
assert.equal(tags.tags.includes('lodging'), true);
assert.equal(tags.tags.includes('customer_request'), true);

const unavailable = await classifyTurnWithModel(
  { text: 'Book a hotel', speaker: 'customer', direction: 'inbound' },
  { env: {}, fetchImpl: async () => { throw new Error('should not fetch'); } },
);
assert.equal(unavailable.ask, true);
assert.match(unavailable.intentError, /OPENROUTER_API_KEY missing/);
assert.equal(unavailable.tags.includes('lodging'), false);

const modelTags = await contentTags('Book a hotel', ['lodging', 'flights'], {
  env: { OPENROUTER_API_KEY: 'test' },
  fetchImpl: jsonFetch({ tags: ['lodging', 'not-allowed'], ask: false }),
});
assert.deepEqual(modelTags.tags, ['lodging']);

console.log('g3c model intent tests passed');
