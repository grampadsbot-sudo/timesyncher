#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assertLopezTripGuard, dryRunLopezFixture, planLopezPhraseCleanup } from './cleanup_lopez_phrase_things.mjs';
import { LOPEZ_CUSTOMER_DISPLAY, LOPEZ_TRIP_TITLE, lopezBadPhraseRows } from './fixtures/lopez-intake-phrase-rows.mjs';

assert.doesNotThrow(() => assertLopezTripGuard({
  tripId: 'staging-lopez-test',
  title: LOPEZ_TRIP_TITLE,
  customerDisplay: LOPEZ_CUSTOMER_DISPLAY,
}));

const plan = dryRunLopezFixture();
assert.ok(plan.removeIds.length >= 8, 'dry-run lists rows to remove');
assert.ok(plan.violations.length > 0);
const composed = plan.violations.filter((row) => row.code === 'composed_or_assistant_phrase');
assert.ok(composed.length >= 5, 'composed phrase violations listed');

const keepsCustomer = planLopezPhraseCleanup([
  ...lopezBadPhraseRows,
  { id: 'keep-me', title: 'Magic Kingdom Haunted Mansion', category: 'activity', metadata: { source: 'long-intake', origin: 'customer_blurb' } },
]);
assert.ok(!keepsCustomer.removeIds.includes('keep-me'), 'customer blurb named place kept');

console.log('test_cleanup_lopez_phrase_things_1192: ok');