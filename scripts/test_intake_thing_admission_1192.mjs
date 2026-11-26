#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  evaluateIntakeAdmission,
  evaluateIntakePreSearch,
  intakePhraseDenied,
  nearDuplicateTitle,
  tripThingsRealGatePasses,
} from '../src/vacation/intake-thing-admission.mjs';

const deny = (title) => assert.ok(intakePhraseDenied(title), `expected deny: ${title}`);
const allowPhrase = (title) => assert.equal(intakePhraseDenied(title), '', `expected allow phrase: ${title}`);

deny('family hotel or resort in Lake Buena Vista');
deny('Lake Buena Vista settle-in with the pool');
assert.ok(nearDuplicateTitle('The Lake Buena Vista hotel', 'Lake Buena Vista hotel'), 'defect A near-dup hotel');
const dupPre = evaluateIntakePreSearch({
  title: 'Lake Buena Vista hotel',
  category: 'hotel',
  metadata: { source: 'customer-turn' },
  existingRows: [{ id: 'stay-1', title: 'The Lake Buena Vista hotel', category: 'hotel' }],
});
assert.equal(dupPre.reason, 'merge_duplicate');

deny('and nothing has been emailed.');
deny('Nothing has been booked');

deny('simple snack after morning snack at Magic Kingdom');
const parade = evaluateIntakePreSearch({ title: 'Magic Kingdom afternoon parade', category: 'restaurant', metadata: {} });
assert.equal(parade.adjustedCategory, 'family_event');

const paradeDup = evaluateIntakePreSearch({
  title: 'Magic Kingdom afternoon parade',
  category: 'activity',
  metadata: { source: 'customer-turn' },
  existingRows: [{ id: 'p1', title: 'Magic Kingdom parade', category: 'activity' }],
});
assert.equal(paradeDup.reason, 'merge_duplicate');

deny('rides between the Lake Buena Vista stay and the parks');
const carPre = evaluateIntakePreSearch({ title: 'rides between Lake Buena Vista stay and the parks', category: 'car', metadata: {} });
assert.equal(carPre.admit, false);

deny('Delta options');
deny('Delta or Southwest early afternoon return flight option');
deny('Delta or Southwest early departure flight option');
deny('flight options outbound Monday April 5 morning landing Orlando International');
deny('flight options return Friday April 9 afternoon');
const deltaOnly = evaluateIntakePreSearch({ title: 'Delta', category: 'flight', metadata: { source: 'customer-turn' } });
assert.equal(deltaOnly.admit, true, 'customer-stated airline name may pre-search');

const blurbEvent = evaluateIntakeAdmission({
  title: 'Magic Kingdom Villains Spectacular',
  category: 'family_event',
  metadata: { source: 'long-intake', origin: 'customer_blurb', needsDetails: true },
  resolvedPlace: null,
  existingRows: [],
});
assert.equal(blurbEvent.admit, true, 'required i blurb placeholder');

deny('Delta or Southwest early departure flight option');
const flightOption = evaluateIntakePreSearch({
  title: 'Delta or Southwest early departure flight option',
  category: 'flight',
  metadata: {},
});
assert.equal(flightOption.admit, false);

allowPhrase('The Lake Buena Vista hotel');

console.log('test_intake_thing_admission_1192: ok');