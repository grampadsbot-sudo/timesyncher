#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  evaluateIntakeAdmission,
  evaluateIntakePreSearch,
  tripItineraryTitleRejected,
  tripThingsRealGatePasses,
} from '../src/vacation/intake-thing-admission.mjs';
import { lopezBadPhraseRows } from './fixtures/lopez-intake-phrase-rows.mjs';
import { LOPEZ_PROVENANCE_CONTEXT } from './fixtures/lopez-intake-customer-turns.mjs';

const ctx = LOPEZ_PROVENANCE_CONTEXT;
const TRIP_NIGHTS = 5;
const STAY_LABEL = 'The Lake Buena Vista hotel';

const REPLAY_ATTEMPTS = [
  {
    title: 'The Lake Buena Vista hotel',
    category: 'hotel',
    metadata: { origin: 'customer_turn', customerTurnId: 'turn-hotel', customerSpan: 'The Lake Buena Vista hotel' },
  },
  {
    title: 'Lake Buena Vista hotel',
    category: 'hotel',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'family hotel or resort in Lake Buena Vista',
    category: 'hotel',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'Lake Buena Vista settle-in with the pool',
    category: 'activity',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'Nothing has been booked',
    category: 'activity',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'and nothing has been emailed.',
    category: 'activity',
    metadata: { origin: 'customer_turn', customerTurnId: 'turn-assistant-f', customerSpan: 'and nothing has been emailed.' },
  },
  {
    title: 'simple snack after morning snack at Magic Kingdom',
    category: 'restaurant',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'Magic Kingdom parade',
    category: 'family_event',
    metadata: { origin: 'customer_turn', customerTurnId: 'turn-parade', customerSpan: 'Magic Kingdom parade' },
  },
  {
    title: 'Magic Kingdom afternoon parade',
    category: 'activity',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'rides between the Lake Buena Vista stay and the parks',
    category: 'car',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'rides between Lake Buena Vista stay and the parks',
    category: 'car',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'Delta options',
    category: 'flight',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'Delta or Southwest early afternoon return flight option',
    category: 'flight',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'Delta or Southwest early departure flight option',
    category: 'flight',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'flight options outbound Monday April 5 morning landing Orlando International',
    category: 'flight',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'flight options return Friday April 9 afternoon',
    category: 'flight',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'Southwest',
    category: 'flight',
    metadata: { source: 'chat_extraction' },
  },
  {
    title: 'Magic Kingdom Villains Spectacular',
    category: 'family_event',
    metadata: { origin: 'customer_blurb', customerSpan: 'Magic Kingdom Villains Spectacular', needsDetails: true },
  },
  {
    title: 'we fly Delta out Monday April 5',
    category: 'flight',
    metadata: { origin: 'customer_turn', customerTurnId: 'turn-flight', customerSpan: 'Delta' },
  },
];

function replayOrlandoIntakeThings(attempts = REPLAY_ATTEMPTS) {
  const existing = [];
  const admitted = [];
  let nextId = 1;
  for (const attempt of attempts) {
    const pre = evaluateIntakePreSearch({ ...attempt, existingRows: existing, provenanceContext: ctx });
    if (!pre.admit) continue;
    const post = evaluateIntakeAdmission({
      ...attempt,
      category: pre.adjustedCategory || attempt.category,
      resolvedPlace: null,
      existingRows: existing,
      provenanceContext: ctx,
    });
    if (!post.admit) continue;
    const row = {
      id: `replay-${nextId}`,
      title: attempt.title,
      category: post.adjustedCategory || pre.adjustedCategory || attempt.category,
      metadata: { ...attempt.metadata },
    };
    nextId += 1;
    existing.push(row);
    admitted.push(row);
  }
  return { admitted, existing };
}

function lodgingTimelineTitlesFromStays(stayRows, { nights = TRIP_NIGHTS } = {}) {
  const hotels = stayRows.filter((row) => String(row.category || '').toLowerCase() === 'hotel');
  assert.equal(hotels.length, 1, 'exactly one Lake Buena Vista stay after replay');
  const stayTitle = hotels[0].title;
  const titles = [`Check-in: ${stayTitle}`];
  for (let night = 0; night < nights; night += 1) {
    titles.push(`Sleep: ${stayTitle}`);
    titles.push(`Wake: ${stayTitle}`);
  }
  return titles;
}

const { admitted } = replayOrlandoIntakeThings();

const hotelRows = admitted.filter((row) => row.category === 'hotel');
assert.equal(hotelRows.length, 1, 'one Lake Buena Vista stay');
assert.match(hotelRows[0].title, /Lake Buena Vista hotel/i, 'stay matches customer hotel');

const familyEvents = admitted.filter((row) => row.category === 'family_event');
assert.ok(familyEvents.some((row) => /Villains Spectacular/i.test(row.title)), 'family event under The Rest category');
assert.equal(admitted.filter((row) => row.category === 'restaurant').length, 0, 'no composed phrase restaurants');
assert.equal(admitted.filter((row) => row.category === 'car').length, 0, 'no composed car phrases');
const flights = admitted.filter((row) => row.category === 'flight');
assert.equal(flights.length, 1, 'one customer flight placeholder');

const itineraryTitles = lodgingTimelineTitlesFromStays(admitted);
assert.equal(itineraryTitles.filter((t) => /^Check-in:/i.test(t)).length, 1, 'one Check-in');
assert.equal(itineraryTitles.filter((t) => /^Sleep:/i.test(t)).length, TRIP_NIGHTS, 'one Sleep per night');
assert.equal(itineraryTitles.filter((t) => /^Wake:/i.test(t)).length, TRIP_NIGHTS, 'one Wake per night');

const badItinerary = ['Nothing has been booked', 'and nothing has been emailed.'];
for (const title of badItinerary) {
  assert.equal(tripItineraryTitleRejected(title, ctx), true, `assistant sentence blocked: ${title}`);
}

const gatePass = tripThingsRealGatePasses(admitted, { itineraryTitles: [], provenanceContext: ctx });
assert.equal(gatePass, true, 'replay trip passes structural gate');
assert.equal(tripThingsRealGatePasses(lopezBadPhraseRows, { itineraryTitles: badItinerary, provenanceContext: ctx }), false, 'old Lopez rows fail gate');

console.log('test_intake_offline_replay_1192: ok');