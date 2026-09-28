import assert from 'node:assert/strict';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { payerPriceLine, planSeatDollars, priceAnswered } from '../src/vacation/seat-price.mjs';

const unconfigured = {};
assert.equal(planSeatDollars(unconfigured), null);
assert.equal(planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '' }), null);
assert.equal(planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '0' }), null);
assert.equal(planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700' }), 27);
assert.equal(payerPriceLine('I pay for Ada.', unconfigured), '');
assert.equal(payerPriceLine('I pay for Ada.', { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), 'Ada $19, paid by you');
assert.equal(priceAnswered('Ada $19, paid by you', 'I pay for Ada.', unconfigured), false);
assert.equal(priceAnswered('Ada $19, paid by you', 'I pay for Ada.', { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), true);

const prompt = replyRulesSystem({}, 'Rio', 'forbidden', false, 'What day works for Ada?', {
  tripContext: {
    itinerary: ['Market: Mon'],
    dates: 'Saved trip dates: Mon through Fri.',
    roster: 'Traveling: Ada (payer account holder).',
    rule: 'Ada does not want two big activities stacked on the same day.',
  },
  seat: { name: 'Ada', payer: 'owner' },
  seatDollars: 0,
});
assert.match(prompt, /Seat record: \{"name":"Ada","payer":"owner"\}/);
assert.match(prompt, /Saved trip record:/);
assert.match(prompt, /"roster":"Traveling: Ada \(payer account holder\)\."/);
assert.match(prompt, /Ada does not want two big activities/);
assert.doesNotMatch(prompt, /\$\d+/);
assert.doesNotMatch(prompt, /Welcome aboard/i);
assert.doesNotMatch(prompt, /Big Island|Kailua-Kona|Kimberly|\bTyler\b|\bLauren\b|\bCraig\b|Vegas|Waikiki|\bApril\b/i);

const priced = replyRulesSystem({}, '', 'forbidden', false, 'How much is a seat? I pay for Ada.', {
  seatDollars: 19,
  planLine: 'Ada $19, paid by you',
});
assert.match(priced, /Each collaborator seat is \$19/);
assert.match(priced, /State this payer line exactly: Ada \$19, paid by you/);
assert.doesNotMatch(priced, /\$27/);

const missing = replyRulesSystem({}, '', 'forbidden', false, 'How much is a seat?', {});
assert.match(missing, /configured seat price is missing/);
assert.doesNotMatch(missing, /\$\d+/);

console.log('reply trip data tests passed');
