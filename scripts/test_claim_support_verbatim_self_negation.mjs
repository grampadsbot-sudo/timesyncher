import assert from 'node:assert/strict';
import test from 'node:test';
import { claimTextSupportedByPage } from '../src/vacation/dossier-claim-support.mjs';

const nonRefundableClaim =
  'Express Deal rental reservations are non-refundable, non-transferable, and non-changeable';
const pageWithVerbatimClaim =
  'You must pay in full at booking. Express Deal rental reservations are non-refundable, non-transferable, and non-changeable even if unused.';

test('verbatim claim with self-negation morphemes is supported when page has no other contradiction', () => {
  assert.equal(claimTextSupportedByPage(nonRefundableClaim, pageWithVerbatimClaim), true);
  assert.equal(
    claimTextSupportedByPage('Located on historic Thompson Street', `Welcome. Located on historic Thompson Street in Greenwich Village.`),
    true,
  );
});

test('verbatim self-negation claim is still rejected when a separate sentence contradicts it', () => {
  const contradictingPage = `${pageWithVerbatimClaim} Update: Express Deal rental reservations are fully refundable and changeable.`;
  assert.equal(claimTextSupportedByPage(nonRefundableClaim, contradictingPage), false);

  const poolClaim = 'This hotel has a rooftop pool and free breakfast.';
  assert.equal(
    claimTextSupportedByPage(poolClaim, `${poolClaim} Update: this hotel has no rooftop pool or free breakfast.`),
    false,
  );
});

console.log('claim support verbatim self-negation tests passed');
