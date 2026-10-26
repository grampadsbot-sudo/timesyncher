#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { searchPlaceOutputViolations } from '../src/vacation/search-place-output.mjs';
import {
  dossierPresented,
  passbPresentedHardTextViolations,
} from '../src/vacation/passb-dossier-presented.mjs';
import { dossierPersistedFillIsNoOp } from '../src/vacation/xai-dossier-fill-state.mjs';

function verifiedPage(url, text) {
  return {
    url,
    text,
    sha256: createHash('sha256').update(text).digest('hex'),
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };
}

const place = { id: 610, title: 'Test Bistro', name: 'Test Bistro', category: 'restaurant' };
const summary = 'Test Bistro is a downtown restaurant known for seasonal plates and attentive wine service.';
const description = [
  'Test Bistro serves seasonal plates, natural wine, and attentive service in a cozy downtown dining room with candlelit tables.',
  'Guests come for the chef-driven menu, warm hospitality, reliable reservations on busy weekends, thoughtful wine pairings,',
  'and a dessert menu that changes with the seasons.',
].join(' ');
const pageText = `${description} ${description}`;
const claim = { text: 'Test Bistro', pages: ['p1'], supported: true };

const dossier = {
  thing: 'Test Bistro',
  pages: [verifiedPage('https://testbistro.example/', pageText)],
  attempts: [{ kind: 'builder', status: 'ok', at: '2026-01-01T00:00:00.000Z' }],
  fields: {
    summary: { value: summary, claims: [claim] },
    description: { value: description, claims: [claim] },
  },
};

const fullContractViolations = searchPlaceOutputViolations({
  ...place,
  summary,
  description,
  title: place.title,
  category: place.category,
});
assert.ok(fullContractViolations.includes('missing_price'), 'full contract still flags missing_price');
assert.ok(
  passbPresentedHardTextViolations({ ...place, summary, description }).length === 0,
  'good_text_missing_price_ignores_non_text_gaps',
);
assert.equal(
  dossierPresented(dossier, place),
  true,
  'dossierPresented good text with missing price/rating/reviews',
);

const weakSummaryDossier = {
  ...dossier,
  fields: {
    ...dossier.fields,
    summary: { value: 'Short note', claims: [claim] },
  },
};
const persisted = { ...dossier, fields: { ...dossier.fields } };
assert.equal(
  dossierPersistedFillIsNoOp(persisted, weakSummaryDossier, place),
  false,
  'weak_summary_fill_is_not_no_op',
);

console.log('test_passb_presented_gate_687: ok');
