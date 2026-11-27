#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  evaluateIntakeAdmission,
  evaluateIntakePreSearch,
  intakeWriteRejected,
  tripThingsRealGatePasses,
} from '../src/vacation/intake-thing-admission.mjs';
import { LOPEZ_CUSTOMER_TURNS, LOPEZ_PROVENANCE_CONTEXT, LOPEZ_TRIP_BLURB } from './fixtures/lopez-intake-customer-turns.mjs';

const ctx = LOPEZ_PROVENANCE_CONTEXT;

const defectA = evaluateIntakePreSearch({
  title: 'family hotel or resort in Lake Buena Vista',
  category: 'hotel',
  metadata: { source: 'chat_extraction' },
  existingRows: [{ id: 'stay-1', title: 'The Lake Buena Vista hotel', category: 'hotel', metadata: { origin: 'customer_turn', customerTurnId: 'turn-hotel', customerSpan: 'The Lake Buena Vista hotel' } }],
  provenanceContext: ctx,
});
assert.equal(defectA.admit, false, 'defect A composed hotel without provenance');

const stayAdmit = evaluateIntakePreSearch({
  title: 'Lake Buena Vista hotel',
  category: 'hotel',
  metadata: {
    origin: 'customer_turn',
    customerTurnId: 'turn-hotel',
    customerSpan: 'The Lake Buena Vista hotel',
  },
  existingRows: [{ id: 'stay-1', title: 'The Lake Buena Vista hotel', category: 'hotel', metadata: { origin: 'customer_turn', customerTurnId: 'turn-hotel', customerSpan: 'The Lake Buena Vista hotel' } }],
  provenanceContext: ctx,
});
assert.equal(stayAdmit.reason, 'merge_duplicate', 'defect A merges customer stay');

assert.ok(intakeWriteRejected('and nothing has been emailed.', { origin: 'customer_turn', customerTurnId: 'turn-assistant-f', customerSpan: 'and nothing has been emailed.' }, ctx), 'defect F assistant turn ref');
assert.ok(intakeWriteRejected('Nothing has been booked', { source: 'chat_extraction' }, ctx), 'defect F no provenance');

assert.ok(intakeWriteRejected('simple snack after morning snack at Magic Kingdom', { source: 'chat_extraction' }, ctx), 'defect G composed restaurant');

const paradeDup = evaluateIntakePreSearch({
  title: 'Magic Kingdom afternoon parade',
  category: 'activity',
  metadata: { source: 'chat_extraction' },
  existingRows: [{ id: 'p1', title: 'Magic Kingdom parade', category: 'activity', metadata: { origin: 'customer_turn', customerTurnId: 'turn-parade', customerSpan: 'Magic Kingdom parade' } }],
  provenanceContext: ctx,
});
assert.equal(paradeDup.admit, false, 'defect H composed near-dup without span');

assert.ok(intakeWriteRejected('rides between the Lake Buena Vista stay and the parks', { source: 'chat_extraction' }, ctx), 'defect I composed car');
const carPre = evaluateIntakePreSearch({ title: 'rides between Lake Buena Vista stay and the parks', category: 'car', metadata: { source: 'chat_extraction' }, provenanceContext: ctx });
assert.equal(carPre.admit, false);

assert.ok(intakeWriteRejected('Delta options', { source: 'chat_extraction' }, ctx), 'defect J');
assert.ok(intakeWriteRejected('Delta or Southwest early afternoon return flight option', { source: 'chat_extraction' }, ctx), 'defect J');
assert.ok(intakeWriteRejected('Delta or Southwest early departure flight option', { source: 'chat_extraction' }, ctx), 'defect J');
assert.ok(intakeWriteRejected('flight options outbound Monday April 5 morning landing Orlando International', { source: 'chat_extraction' }, ctx), 'defect J');
assert.ok(intakeWriteRejected('flight options return Friday April 9 afternoon', { source: 'chat_extraction' }, ctx), 'defect J');

const deltaCustomer = evaluateIntakePreSearch({
  title: 'Delta',
  category: 'flight',
  metadata: {
    origin: 'customer_turn',
    customerTurnId: 'turn-flight',
    customerSpan: 'Delta',
  },
  provenanceContext: ctx,
});
assert.equal(deltaCustomer.admit, true, 'customer-stated airline placeholder once');

const blurbEvent = evaluateIntakeAdmission({
  title: 'Magic Kingdom Villains Spectacular',
  category: 'family_event',
  metadata: {
    origin: 'customer_blurb',
    customerSpan: 'Magic Kingdom Villains Spectacular',
    needsDetails: true,
  },
  resolvedPlace: null,
  existingRows: [],
  provenanceContext: { tripBlurb: LOPEZ_TRIP_BLURB, customerTurns: LOPEZ_CUSTOMER_TURNS },
});
assert.equal(blurbEvent.admit, true, 'required i blurb placeholder');

assert.ok(intakeWriteRejected('Delta or Southwest early departure flight option', { source: 'chat_extraction' }, ctx), 'required ii');
const flightOption = evaluateIntakePreSearch({
  title: 'Delta or Southwest early departure flight option',
  category: 'flight',
  metadata: { source: 'chat_extraction' },
  provenanceContext: ctx,
});
assert.equal(flightOption.admit, false);

assert.equal(
  tripThingsRealGatePasses([
    {
      id: 'hotel-good',
      title: 'The Lake Buena Vista hotel',
      category: 'hotel',
      metadata: { origin: 'customer_turn', customerTurnId: 'turn-hotel', customerSpan: 'The Lake Buena Vista hotel' },
    },
  ], { provenanceContext: ctx }),
  true,
);

console.log('test_intake_thing_admission_1192: ok');