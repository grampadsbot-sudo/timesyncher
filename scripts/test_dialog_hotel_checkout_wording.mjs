#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeLodgingCheckoutWording } from '../src/vacation/reply-lodging-checkout-wording.mjs';
import { finalizeCustomerReplyText } from '../src/vacation/reply-customer-wording.mjs';

const lodging = [
  ["I don't have hotel arrival or checkout times on the record yet, so I won't mark either one as set.", "I don't have hotel arrival or check-out times on the record yet, so I won't mark either one as set."],
  ['I also have not placed hotel check-in on Monday, April 5 or checkout on Friday, April 9.', 'I also have not placed hotel check-in on Monday, April 5 or check-out on Friday, April 9.'],
  ["Check-in and checkout aren't on the saved record either.", "Check-in and check-out aren't on the saved record either."],
  ["Check-in, checkout, and an early swim on Monday, April 5 aren't placed either.", "Check-in, check-out, and an early swim on Monday, April 5 aren't placed either."],
  ['Friday, April 9 is checkout, marked hotel TBD.', 'Friday, April 9 is check-out, marked hotel TBD.'],
  ['Please enter those times on the vacation site next to the arrival and checkout days.', 'Please enter those times on the vacation site next to the arrival and check-out days.'],
  ['I cannot confirm the Friday, April 9 morning checkout from this chat.', 'I cannot confirm the Friday, April 9 morning check-out from this chat.'],
  ['The return flight leaves mid-afternoon, so a late checkout request is worth a call.', 'The return flight leaves mid-afternoon, so a late check-out request is worth a call.'],
  ['Checkout is at 11.', 'Check-out is at 11.'],
  ['Share your check out time when you have it.', 'Share your check-out time when you have it.'],
  ['Hotel check out times vary.', 'Hotel check-out times vary.'],
  ['We can plan the last morning after checkout.', 'We can plan the last morning after check-out.'],
];
for (const [input, expected] of lodging) {
  assert.equal(normalizeLodgingCheckoutWording(input), expected, input);
  assert.equal(finalizeCustomerReplyText(input), expected, input);
  assert.doesNotMatch(finalizeCustomerReplyText(input), /\bcheckout\b|\bcheck out time/i, input);
}
assert.equal(normalizeLodgingCheckoutWording(lodging.map(([input]) => input).join(' ')), lodging.map(([, expected]) => expected).join(' '));

const untouched = [
  'Use the checkout page to finish your purchase.',
  'Stripe checkout handles billing for the yearly plan.',
  'The collaborator checkout link is ready when you want it.',
  'Pay at checkout with your card.',
  'See routes/checkout-config.mjs and /checkout for the order.',
  'The checkout modules stay as they are.',
  'You can check out the pool on Monday.',
  'Check-in and check-out are saved for Monday and Friday.',
  '',
];
for (const line of untouched) assert.equal(normalizeLodgingCheckoutWording(line), line, line);
assert.equal(normalizeLodgingCheckoutWording(null), '');

const liveTurn = readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const sharedRules = readFileSync(new URL('../src/vacation/reply-prompt-sections.mjs', import.meta.url), 'utf8');
const tieredRules = readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
for (const [name, source] of [
  ['live-app-turn.mjs', liveTurn],
  ['reply-prompt-sections.mjs', sharedRules],
]) {
  assert.doesNotMatch(source, /\bcheckout\b/i, `${name} prompt/rule text has a bare checkout`);
  assert.match(source, /after check-out, or one last time/, name);
  assert.match(source, /Write hotel and lodging times as check-in and check-out, with the hyphen\./, name);
}
assert.doesNotMatch(tieredRules, /\bcheckout\b/i, 'vacation-app-reply-rules.mjs prompt/rule text has a bare checkout');

const ship = readFileSync(new URL('../src/vacation/reply-ship.mjs', import.meta.url), 'utf8');
assert.match(ship, /produced\.reply = finalizeCustomerReplyText\(produced\.reply\)/);
assert.match(ship, /finished\.reply = finalizeCustomerReplyText\(finished\.reply\)/);

console.log('test_dialog_hotel_checkout_wording: ok');
