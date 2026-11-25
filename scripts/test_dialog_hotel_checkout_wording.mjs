#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeLodgingCheckoutWording } from '../src/vacation/reply-lodging-checkout-wording.mjs';
import { finalizeCustomerReplyText } from '../src/vacation/reply-customer-wording.mjs';

const liveTurn = readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const rules = readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(liveTurn, /\bafter checkout\b/);
assert.doesNotMatch(rules, /\bafter checkout\b/);

assert.equal(
  normalizeLodgingCheckoutWording("I don't have hotel arrival or checkout times on the record yet."),
  "I don't have hotel arrival or check-out times on the record yet.",
);
assert.equal(
  normalizeLodgingCheckoutWording('Share your check out time when you have it.'),
  'Share your check-out time when you have it.',
);
assert.equal(
  normalizeLodgingCheckoutWording('We can plan the last morning after checkout.'),
  'We can plan the last morning after check-out.',
);

const paymentLines = [
  'Use the checkout page to finish your purchase.',
  'Stripe checkout handles billing for the yearly plan.',
  'The collaborator checkout link is ready when you want it.',
];
for (const line of paymentLines) {
  assert.equal(normalizeLodgingCheckoutWording(line), line, line);
}

assert.doesNotMatch(finalizeCustomerReplyText('Lodging check-in is saved; check-out is still open.'), /\bcheckout\b/i);

console.log('test_dialog_hotel_checkout_wording: ok');