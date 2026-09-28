import assert from 'node:assert/strict';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { checkoutAmounts } from '../src/vacation/checkout-pricing.mjs';
import { payerPriceLine, planSeatDollars, priceAnswered } from '../src/vacation/seat-price.mjs';

assert.throws(() => checkoutAmounts({}), /checkout config missing: TIMESYNCHER_ORDER_BUMP_PRICE_CENTS/);
assert.equal(checkoutAmounts({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }).orderBump, 1900);

const unconfigured = {};
const missingPrice = (error) => error?.name === 'CheckoutConfigError' && /TIMESYNCHER_ORDER_BUMP_PRICE_CENTS/.test(error.message);
assert.throws(() => planSeatDollars(unconfigured), missingPrice);
assert.throws(() => planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '' }), missingPrice);
assert.throws(() => planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '0' }), missingPrice);
assert.equal(planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), 19);
assert.throws(() => payerPriceLine('I pay for Ada.', unconfigured), missingPrice);
assert.equal(payerPriceLine('I pay for Ada.', { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), 'Ada $19, paid by you');
assert.throws(() => priceAnswered('Ada $19, paid by you', 'I pay for Ada.', unconfigured), missingPrice);
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
assert.doesNotMatch(prompt, /use only places, activities, and venues the customer already named/);
assert.match(prompt, /Ask the customer for anything they haven't said/);
assert.doesNotMatch(prompt, /Big Island|Kailua-Kona|Kimberly|\bTyler\b|\bLauren\b|\bCraig\b|Vegas|Waikiki|\bApril\b|four friends/i);

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
