#!/usr/bin/env node
import assert from 'node:assert/strict';
import { composeListRowDescription } from '../src/vacation/list-row-description.mjs';
import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { prepareFixtureReplaySharedTrip } from '../src/vacation/shared-trip-fixture-replay.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { buildGateBApprovedSharedTrip } from './fixtures/gate-b-approved-shared-trip.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { rowSummary } from '../apps/vacation-client/src/lib/listTabModel.mjs';
import {
  mergeStoredCcabNarrativeIntoOverride,
  resolveStoredCcabKey,
  shouldMergeStoredCcabOnFixtureReplay,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { isHotelPlanningNote } from '../src/vacation/trip-thing-enrichment.mjs';

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

assert.equal(resolveStoredCcabKey({ name: 'Smoke' }, {})?.ccabKey, 'Smoke Jazz & Supper Club');

const smokeGap = finalizeServedSharedTripPayload({
  places: [{
    id: 902,
    name: 'Smoke',
    category_name: 'activity',
    price: 45,
    description: 'Documented NYC option (music)',
  }],
  thingOverrides: { 'place:902': { startTime: '21:00', price: 45 } },
  days: [],
  assignments: {},
});
const gapPlace = smokeGap.places.find((place) => place.id === 902);
const gapOverride = smokeGap.thingOverrides['place:902'] || {};
assert.ok(
  narrativeWordCount(gapOverride.longDetails || gapOverride.description || '') >= 30,
  'unique short Smoke title should bind stored ccab narrative',
);
assert.ok(narrativeWordCount(rowSummary(gapPlace, smokeGap)) >= 6);

const smokeReplay = prepareFixtureReplaySharedTrip(Buffer.from(JSON.stringify({
  places: [{
    id: 49,
    name: 'Smoke',
    category_name: 'Activity',
    description: 'Documented NYC option (music)',
    price: 45,
  }],
  thingOverrides: {
    'place:49': { timeline: false, startTime: '9:00 PM' },
  },
}))).served;
const smokeReplayPlace = smokeReplay.places.find((place) => place.id === 49);
assert.equal(
  shouldMergeStoredCcabOnFixtureReplay(smokeReplayPlace, smokeReplay.thingOverrides['place:49']),
  true,
);
assert.ok(narrativeWordCount(rowSummary(smokeReplayPlace, smokeReplay)) >= 30);

const smokeReplayFullTitle = prepareFixtureReplaySharedTrip(Buffer.from(JSON.stringify({
  places: [{
    id: 49,
    name: 'Smoke Jazz & Supper Club',
    category_name: 'Activity',
    description: 'Documented NYC option (music)',
    price: 45,
  }],
  thingOverrides: {
    'place:49': { timeline: false, startTime: '9:00 PM' },
  },
}))).served;
const smokeFullPlace = smokeReplayFullTitle.places.find((place) => place.id === 49);
assert.equal(
  shouldMergeStoredCcabOnFixtureReplay(smokeFullPlace, smokeReplayFullTitle.thingOverrides['place:49']),
  true,
);
assert.ok(
  narrativeWordCount(rowSummary(smokeFullPlace, smokeReplayFullTitle)) >= 30,
  'fixture replay must merge stored ccab when title matches key but copy is generic',
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

function blueNoteDescriptionFields(trip = {}) {
  const override = trip.thingOverrides?.['place:611'] || {};
  return {
    longDetails: String(override.longDetails || override.description || '').trim(),
    externalId: trip.places?.find((place) => place.id === 611)?.externalId || '',
  };
}

const liveServed = buildGateBApprovedSharedTrip();
const rawFixture = buildNycCraigKimDaybydayTrip();
const replayServed = prepareFixtureReplaySharedTrip(Buffer.from(JSON.stringify(rawFixture))).served;
const liveBlueNote = blueNoteDescriptionFields(liveServed);
const replayBlueNote = blueNoteDescriptionFields(replayServed);
assert.equal(replayBlueNote.externalId, 'Jazz at Lincoln Center');
assert.equal(liveBlueNote.externalId, replayBlueNote.externalId);
assert.equal(liveBlueNote.longDetails, replayBlueNote.longDetails);
assert.ok(narrativeWordCount(liveBlueNote.longDetails) >= 30);

const aliasServed = finalizeServedSharedTripPayload({
  places: [{
    id: 5,
    name: 'Blue Note',
    category_name: 'Activity',
    place_time: '8:00 PM',
    website: 'https://www.bluenote.net/',
    price: 40,
  }],
  thingOverrides: {
    'place:5': {
      sourceRecord: {
        website: 'https://www.bluenotejazz.com/',
        logoUrl: 'https://www.bluenotejazz.com/favicon.ico',
      },
    },
  },
  days: [],
  assignments: {},
});
const aliasOverride = aliasServed.thingOverrides['place:5'] || {};
assert.equal(aliasServed.places[0].externalId, 'Blue Note Jazz Club');
assert.ok(
  narrativeWordCount(aliasOverride.longDetails || '') >= 30,
  'Blue Note alias row should bind stored ccab narrative via website or unique name prefix',
);
assert.match(aliasOverride.longDetails || '', /Greenwich Village jazz/i);

const gateBHotelNames = [
  'Park Central Hotel New York',
  'New York Marriott Downtown',
  'The Manhattan at Times Square Hotel',
  'Hotel Edison',
  'Hyatt Grand Central New York',
];
for (const name of gateBHotelNames) {
  const served = finalizeServedSharedTripPayload({
    places: [{ id: 701, name, category_name: 'hotel' }],
    thingOverrides: { 'place:701': {} },
    days: [],
    assignments: {},
  });
  const place = served.places[0];
  const override = served.thingOverrides['place:701'] || {};
  const description = rowSummary(place, served);
  assert.ok(narrativeWordCount(description) >= 30, `${name} hotel list row under 30 words`);
  assert.equal(isHotelPlanningNote(override.summary), false, `${name} summary still planning-note template`);
  assert.doesNotMatch(description, /^Neighborhood:/, `${name} description must not lead with planning-note template`);
  assert.ok(
    /walkable|subway|couples|guest rating|official listing/i.test(description),
    `${name} missing hotel substance cues`,
  );
}

const mottoServed = finalizeServedSharedTripPayload({
  places: [{
    id: 603,
    name: 'Motto by Hilton New York City Times Square',
    category_name: 'hotel',
  }],
  thingOverrides: { 'place:603': { price: 188 } },
  days: [],
  assignments: {},
});
assert.match(
  rowSummary(mottoServed.places[0], mottoServed),
  /fitness center|Times Square|eco-certified/i,
  'Motto keeps sourced review overlay narrative',
);

console.log('stored ccab canonical identity tests passed');
