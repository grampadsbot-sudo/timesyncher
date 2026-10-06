#!/usr/bin/env node
/**
 * ASK-d2 repro at 68d3ff0. Seeded from staging trip eadb6e7c-9e1f-4672-b8a7-2114073776f3,
 * customer turn 0208eee7-4bc9-4afb-abc1-1babc93a840d, request a9588b7b-0ed0-4c3d-a4e3-9f1e3c8ba5dc.
 * Stored turn_category travel_research, tags customer_request + restaurants_food, source
 * internal_speaker, confidence 0.9. Live response turnTag.ask was false. Jev routeType
 * notes_where, needsDayForNote 0.28. Trip metadata at reply time (unchanged by this turn):
 * lastAskedGap lodging, lodgingAsk true, needsCustomerInput [lodging], invite_contact_needed true.
 * Things already saved: Mama's Fish House (Saturday) and Paia Fish Market Restaurant (no day).
 * placeSearchReplyFacts is the object stored on that customer turn.
 *
 * Expected to fail at 68d3ff0. Not listed in scripts/offline-tests.txt.
 */
import assert from 'node:assert/strict';
import { annotateLiveTurnGapAnswer, mergeSavedTripGapFields } from '../src/vacation/gap-ask-reply-context.mjs';
import { completeRosterParty, draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const customerTurn = 'save Paia Fish Market';
const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const placeSearchReplyFacts = {
  chatPlaceSearch: {
    scheduled: [],
    unscheduled: [{ title: 'Paia Fish Market Restaurant', notOnADay: true }],
    unscheduledDayRule: 'Each place in unscheduled is not on a day. Tell the customer that for each of those places.',
  },
};
const saved = {
  destination: 'Maui',
  start: '2027-03-10T00:00:00.000Z',
  end: '2027-03-17T00:00:00.000Z',
  party: {
    editors: [],
    primary: { name: 'D Trip', role: 'Owner' },
    sources: [],
    viewers: [],
    collaborators: [],
    preference_subjects: [],
  },
  planOwned: false,
  things: [
    {
      title: "Mama's Fish House",
      category: 'restaurant',
      who: '',
      whenLabel: 'Saturday',
      customerWhen: '',
      notes: ["add Mama's Fish House for Saturday"],
    },
    {
      title: 'Paia Fish Market Restaurant',
      category: 'restaurant',
      who: '',
      whenLabel: '',
      customerWhen: '',
      notes: [],
      sourceRef: { id: 'loc4DKZTNV325I2EAJ44QKQTHDDDYBYCKK4BGBM64BQ=', source: 'brave' },
    },
  ],
  lastAskedGap: 'lodging',
  invite_contact_needed: true,
  lodgingAsk: true,
  needsCustomerInput: ['lodging'],
  statedLodgingArea: '',
};

const span = {
  start: savedStart,
  end: savedEnd,
  spanLabel: 'Wed Mar 10\u2013Wed Mar 17 2027',
};
const party = completeRosterParty({
  party: saved.party,
  customerName: 'D Trip',
  turns: [
    { role: 'customer', text: 'Maui March 10-17 2027 with my wife' },
    { role: 'customer', text: "add Mama's Fish House for Saturday" },
    { role: 'customer', text: customerTurn },
  ],
  roster: [],
  rosterError: null,
});
const merged = annotateLiveTurnGapAnswer({
  destination: saved.destination,
  start: span.start,
  end: span.end,
  span,
  things: saved.things,
  party,
  planOwned: false,
  ...mergeSavedTripGapFields(saved),
}, saved, { wantedThings: [] });

assert.equal(merged.gapAnswerTurn, undefined);
assert.equal(merged.lastAskedGap, 'lodging');
assert.equal(merged.lodgingAsk, undefined);

const facts = draftingFacts(
  [
    { role: 'customer', text: 'Maui March 10-17 2027 with my wife' },
    { role: 'customer', text: "add Mama's Fish House for Saturday" },
  ],
  customerTurn,
  merged,
);
assert.equal(facts.gapAnswerTurn, undefined);
const tripContext = await enrichDraftingTripContext(facts, {
  things: merged.things,
  env: {},
  placeSearchReplyFacts,
  savedStart,
  savedEnd,
  wantedThings: [],
});
const rules = { ok: true, notes_where: 'day_only_place_optional' };
const system = replyRulesSystem(rules, 'Maui', 'forbidden', false, customerTurn, { tripContext });

const violations = [];
if (facts.lodgingAsk === true) violations.push('facts.lodgingAsk');
if (Array.isArray(facts.needsCustomerInput) && facts.needsCustomerInput.includes('lodging')) {
  violations.push(`facts.needsCustomerInput=${JSON.stringify(facts.needsCustomerInput)}`);
}
if (/includes lodgingAsk|where they are staying/i.test(system)) violations.push('lodging question instruction');
if (/needsCustomerInput"\s*:\s*\[\s*"lodging"\s*\]/.test(system)) violations.push('prompt lodging-missing fact');
if (/Tell the customer that for each of those places/.test(system)) violations.push('unscheduled day instruction');
if (/unscheduledDayRule/.test(system)) violations.push('unscheduledDayRule field');
if (/name the day \(required\)/.test(system)) violations.push('day-required notes line');
if (/\bwhich day\b/i.test(system)) violations.push('which-day question');
if (!/"notOnADay":true/.test(system)) violations.push('missing notOnADay fact');
if (!/Paia Fish Market Restaurant: not on a day/.test(system)) violations.push('missing plain not-on-a-day state');
assert.deepEqual(violations, []);
