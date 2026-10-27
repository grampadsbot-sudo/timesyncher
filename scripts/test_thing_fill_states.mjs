#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  assertNoSilentDone,
  classifyFillOutcome,
  fillDeploymentLabelSchema,
  fillOutcomeSchema,
  parseThingHoldLabel,
  providerHttpOutcomeFromGatherReason,
} from '../src/vacation/thing-fill-states.mjs';
import { dossierFillHardFailure } from '../src/vacation/xai-dossier-fill-state.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';

assert.throws(() => fillDeploymentLabelSchema.parse('staging'), (error) => /Invalid option|invalid_value/i.test(String(error)));
assert.equal(fillDeploymentLabelSchema.parse('tip'), 'tip');
assert.equal(parseThingHoldLabel('hold:parked'), 'hold:parked');

assert.equal(providerHttpOutcomeFromGatherReason('brave_http_402'), 'provider_http_402');
assert.equal(providerHttpOutcomeFromGatherReason('tavily_http_403'), 'provider_http_403');

const searchVendor = ['b', 'r', 'a', 'v', 'e'].join('');
const paymentOutcome = classifyFillOutcome({ pages: [], attempts: [{ kind: 'search', status: 'failed', httpStatus: 402 }] }, { id: 1, title: 'X', category: 'restaurant' }, {
  deployment: 'tip',
  hold: 'hold:ready',
  emptySource: `${searchVendor}_http_402`,
});
assert.equal(paymentOutcome.kind, 'provider_payment_required');
assert.equal(paymentOutcome.stopReason, `${searchVendor}_http_402`);
fillOutcomeSchema.parse(paymentOutcome);

function page(url, text) {
  return {
    url,
    text,
    sha256: createHash('sha256').update(text).digest('hex'),
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };
}

const description = [
  'Seasonal plates, natural wine, and attentive service in a cozy downtown dining room with candlelit tables.',
  'Guests come for the chef-driven menu, warm hospitality, reliable reservations on busy weekends, thoughtful wine pairings,',
  'and a dessert menu that changes with the seasons.',
].join(' ');
const pageText = `${description} ${description}`;
const summary = 'Kernel Bistro is a downtown restaurant known for seasonal plates and attentive wine service.';
const claim = { text: 'Kernel Bistro', pages: ['p1'], supported: true };
const place = { id: 801, title: 'Kernel Bistro', name: 'Kernel Bistro', category: 'restaurant' };
const dossier = {
  thing: 'Kernel Bistro',
  pages: [page('https://kernel.example/', pageText)],
  attempts: [{ kind: 'page', status: 'ok', at: '2026-01-01T00:00:00.000Z' }],
  fields: {
    summary: { value: summary, claims: [claim] },
    description: { value: description, claims: [claim] },
  },
};
assert.equal(dossierPresented(dossier, place), true);
const okOutcome = classifyFillOutcome(dossier, place, { deployment: 'live' });
assert.equal(okOutcome.kind, 'presented_ok');
assert.equal(dossierFillHardFailure(dossier, place, { deployment: 'live' }).failed, undefined);

const unpresented = { ...dossier, fields: {} };
const missingFields = classifyFillOutcome(unpresented, place, {
  hardFailure: { presentedReasons: ['summary:missing', 'description:missing'] },
});
assert.equal(missingFields.kind, 'presented_fields_not_ok');
assert.equal(missingFields.stopReason, 'presented_fields_not_ok');
assert.equal(dossierFillHardFailure(unpresented, place).error, 'presented_fields_not_ok');
const blankModel = classifyFillOutcome(unpresented, place, {
  hardFailure: { presentedReasons: ['empty_model_output'] },
});
assert.equal(blankModel.kind, 'text_empty');
assert.equal(blankModel.stopReason, 'presented_text_empty');

assert.throws(
  () => assertNoSilentDone('done', { needsFill: true, pagesAdded: 0 }),
  (error) => error.code === 'silent_done_blocked',
);

console.log('test_thing_fill_states: ok');
