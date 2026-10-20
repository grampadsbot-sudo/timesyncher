#!/usr/bin/env node
import assert from 'node:assert/strict';
import { composeListRowDescription } from '../src/vacation/list-row-description.mjs';
import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import {
  mergeStoredCcabNarrativeIntoOverride,
  resolveStoredCcabKey,
} from './fixtures/pr336-vk-search-trip-sources.mjs';

function narrativeWordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

const STRAND_KEY = 'Strand Book Store';
const BLUE_NOTE_KEY = 'Blue Note Jazz Club';

assert.equal(
  resolveStoredCcabKey(
    { name: 'Strand', externalId: STRAND_KEY },
    {},
  )?.ccabKey,
  STRAND_KEY,
);

assert.equal(
  resolveStoredCcabKey(
    {
      name: 'Blue Note',
      metadata: {
        externalId: BLUE_NOTE_KEY,
        sourceRecord: { ccabKey: BLUE_NOTE_KEY },
      },
    },
    {},
  )?.ccabKey,
  BLUE_NOTE_KEY,
);

assert.equal(
  resolveStoredCcabKey({ name: 'Totally fabricated venue label' }, {}),
  null,
);

const userNarrative = Array.from({ length: 32 }, (_, index) => `custom${index}`).join(' ');
const preserved = mergeStoredCcabNarrativeIntoOverride(
  { name: 'Blue Note' },
  { longDetails: userNarrative },
);
assert.equal(preserved.longDetails, userNarrative);

const preservedWithIdentity = mergeStoredCcabNarrativeIntoOverride(
  { name: 'An arbitrary concert venue', externalId: BLUE_NOTE_KEY },
  { longDetails: userNarrative },
);
assert.equal(preservedWithIdentity.longDetails, userNarrative);

const preservedWithMetadataIdentity = mergeStoredCcabNarrativeIntoOverride(
  { name: 'Another venue', metadata: { sourceRecord: { ccabKey: STRAND_KEY } } },
  { longDetails: userNarrative },
);
assert.equal(preservedWithMetadataIdentity.longDetails, userNarrative);

const thinAlias = mergeStoredCcabNarrativeIntoOverride(
  { name: 'Blue Note', externalId: BLUE_NOTE_KEY },
  { startTime: '20:00', price: 85 },
);
assert.ok(
  narrativeWordCount(thinAlias.longDetails) >= 30,
  'thin override should pick up stored ccab narrative via externalId',
);
assert.match(thinAlias.longDetails, /Greenwich Village jazz room/i);

const served = finalizeServedSharedTripPayload({
  places: [{
    id: 901,
    name: 'Smoke',
    category_name: 'activity',
    externalId: 'Smoke Jazz & Supper Club',
    price: 45,
  }],
  thingOverrides: {
    'place:901': { startTime: '21:00', price: 45 },
  },
  days: [],
  assignments: {},
});

const smokeOverride = served.thingOverrides['place:901'] || {};
assert.match(smokeOverride.longDetails || '', /Upper West Side jazz room/i);

const smokeGap = finalizeServedSharedTripPayload({
  places: [{ id: 902, name: 'Smoke', category_name: 'activity', price: 45 }],
  thingOverrides: { 'place:902': { startTime: '21:00', price: 45 } },
  days: [],
  assignments: {},
});
const gapOverride = smokeGap.thingOverrides['place:902'] || {};
assert.ok(
  narrativeWordCount(gapOverride.longDetails || gapOverride.description || '') < 30,
  'Smoke without canonical externalId stays thin until trek stores identity',
);

const liveFields = applyLiveAppListRowFields({
  places: [{
    id: 903,
    name: 'BN',
    category_name: 'activity',
    metadata: {
      externalId: BLUE_NOTE_KEY,
      sourceRecord: { ccabKey: BLUE_NOTE_KEY },
    },
  }],
  thingOverrides: { 'place:903': { startTime: '20:30', price: 85 } },
});
const composed = composeListRowDescription({
  category: 'activity',
  summary: '',
  fields: liveFields.thingOverrides['place:903'],
});
assert.match(composed, /bluenote\.net/i);

console.log('stored ccab canonical identity tests passed');
