import assert from 'node:assert/strict';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { checkoutAmounts, checkoutOrderSummary } from '../src/vacation/checkout-pricing.mjs';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { payerPriceLine, planSeatDollars, priceAnswered } from '../src/vacation/seat-price.mjs';

assert.throws(() => checkoutAmounts({}), /checkout config missing: TIMESYNCHER_BASE_PRICE_CENTS/);
assert.equal(checkoutAmounts({
  TIMESYNCHER_BASE_PRICE_CENTS: '3700',
  TIMESYNCHER_MEDIA_PRICE_CENTS: '1700',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900',
}).orderBump, 1900);

const unconfigured = {};
const missingPrice = (error) => error?.name === 'CheckoutConfigError' && /TIMESYNCHER_ORDER_BUMP_PRICE_CENTS/.test(error.message);
assert.throws(() => planSeatDollars(unconfigured), missingPrice);
assert.throws(() => planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '' }), missingPrice);
assert.throws(() => planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '0' }), missingPrice);
assert.equal(planSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), 19);
const adaSeats = [{ name: 'Ada', payer: 'you' }];
assert.equal(payerPriceLine(adaSeats, unconfigured), '');
assert.equal(payerPriceLine('I pay for Ada.', unconfigured), '');
assert.equal(payerPriceLine('I pay for Ada.', unconfigured, adaSeats), '');
assert.equal(payerPriceLine(adaSeats, { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), 'Ada $19, paid by you');
assert.equal(payerPriceLine('I pay for Ada.', { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }, adaSeats), 'Ada $19, paid by you');
assert.equal(priceAnswered('Ada $19, paid by you', adaSeats, unconfigured), true);
assert.equal(priceAnswered('Ada $19, paid by you', adaSeats, { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), true);
assert.equal(priceAnswered('Ada $19, paid by you', 'I pay for Ada.', unconfigured), true);
assert.equal(priceAnswered('Ada $19, paid by you', { seats: adaSeats }, { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), true);
const savedCheckoutEnv = {};
for (const key of [
  'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS',
  'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS',
  'TIMESYNCHER_COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS',
  'TIMESYNCHER_BASE_PRICE_CENTS',
  'TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS',
  'TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS',
  'TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS',
  'TIMESYNCHER_CHECKOUT_CURRENCY',
]) {
  savedCheckoutEnv[key] = process.env[key];
  delete process.env[key];
}
assert.equal(priceAnswered('Ada $19, paid by you', adaSeats), true);
assert.equal(priceAnswered('Ada $19, paid by you', { seats: adaSeats }), true);
assert.equal(priceAnswered('Ada $19, paid by you', 'I pay for Ada.'), true);
assert.equal(priceAnswered('No amount is in this reply.', adaSeats), false);
assert.equal(priceAnswered('No amount is in this reply.', 'I pay for Ada.'), false);
for (const [key, value] of Object.entries(savedCheckoutEnv)) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}
assert.throws(() => checkoutOrderSummary({}, {}), /checkout config missing: TIMESYNCHER_BASE_PRICE_CENTS/);
assert.throws(() => checkoutOrderSummary({ orderBump: true }, {}), /checkout config missing: TIMESYNCHER_BASE_PRICE_CENTS/);

const chatTurn = await produceLiveAppReply({
  customerTurn: 'How much is a seat? I pay for Ada.',
  session: {},
  priorTurns: [],
  env: { TIMESYNCHER_JEV_CLASSIFY_URL: 'https://openrouter.ai/api/v1/chat/completions' },
});
assert.equal(String(chatTurn?.reason || '').includes('checkout config'), false);
assert.equal(chatTurn?.error || null, null);

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
assert.match(priced, /"seat_dollars":19/);
assert.match(priced, /Ada \$19, paid by you/);
assert.doesNotMatch(priced, /\$27/);

const missing = replyRulesSystem({}, '', 'forbidden', false, 'How much is a seat?', {});
assert.doesNotMatch(missing, /configured seat price is missing|price not configured/);
assert.match(missing, /"seat_dollars":null/);
assert.doesNotMatch(missing, /\$\d+/);

console.log('reply trip data tests passed');
