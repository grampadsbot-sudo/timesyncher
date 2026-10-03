#!/usr/bin/env node
/**
 * Shepherd staging smoke check M: farmers market near Kihei after Hyatt + Westin lodging turns.
 * Rebuilds the place-search reply prompt/facts: labelled lodging context stays separate from Results.
 */
import assert from 'node:assert/strict';
import { draftingFacts, completeRosterParty } from '../src/vacation/live-app-turn.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import {
  CUSTOMER_OWN_LODGING_CONTEXT_LABEL,
  modelVisibleTripContext,
  placeResultExtra,
} from '../src/vacation/provider-result-context.mjs';
import { loadVacationAppReplyRules, replyRequestBody, replyRulesSystem } from './vacation-app-reply-rules.mjs';

const customerTurn = 'farmers market near Kihei';
const inTurnPlaceResults = [
  { title: 'Kihei Farmers Market', name: 'Kihei Farmers Market', source: 'osm', category: 'market' },
  { title: 'South Maui Farmers Market', name: 'South Maui Farmers Market', source: 'brave', category: 'market' },
];
const things = [
  {
    title: 'Hyatt Regency Maui',
    category: 'hotel',
    metadata: { customerStatedLodging: true, source: 'customer_stated' },
    location: { locality: 'Kaanapali', address: '200 Nohea Kai Dr, Lahaina, HI 96761' },
  },
  {
    title: "The Westin Maui Resort & Spa, Ka'anapali",
    category: 'hotel',
    metadata: { source: 'customer_stated' },
    location: { locality: "Ka'anapali" },
  },
];
const priorTurns = [
  { role: 'customer', text: 'Maui March 10-17 2027 with my wife' },
  { role: 'customer', text: "We're staying at the Hyatt Regency Maui in Kaanapali." },
  { role: 'customer', text: "We're staying at the Westin Maui in Kaanapali." },
  { role: 'customer', text: 'best tacos near our hotel' },
  { role: 'customer', text: 'tacos near our hotel' },
];
const saved = {
  destination: 'Maui',
  start: '2027-03-10T00:00:00.000Z',
  end: '2027-03-17T00:00:00.000Z',
  span: { spanLabel: 'Wed Mar 10\u2013Wed Mar 17 2027' },
  party: completeRosterParty({
    party: {
      primary: { name: 'Shepherd', role: 'Owner' },
      collaborators: [{ name: 'wife' }],
    },
  }),
  things,
  statedLodgingArea: 'Kaanapali',
};

const drafting = {
  ...draftingFacts(priorTurns, customerTurn, saved),
  statedLodgingArea: saved.statedLodgingArea,
};
const tripContext = await enrichDraftingTripContext(drafting, {
  things,
  session: null,
  env: {},
  inTurnPlaceResults,
});
assert.equal(tripContext.lodging, undefined);
assert.equal(tripContext.statedLodgingArea, undefined);
assert.ok(tripContext.customerOwnLodgingContext?.label === CUSTOMER_OWN_LODGING_CONTEXT_LABEL);
assert.equal(tripContext.customerOwnLodgingContext.lodging, 'Hyatt Regency Maui');
assert.equal(tripContext.customerOwnLodgingContext.statedLodgingArea, 'Kaanapali');
assert.ok(Array.isArray(tripContext.tripReplyGate) && tripContext.tripReplyGate.length > 0, 'guard rows stay on full tripContext');
assert.deepEqual(tripContext.citablePlaces, [
  'Kihei Farmers Market',
  'South Maui Farmers Market',
]);
assert.equal(tripContext.citablePlaces.some((title) => /hyatt|westin/i.test(title)), false);
assert.equal(tripContext.notCitableAsResult.some((title) => /westin/i.test(title)), true);
assert.equal(tripContext.notCitableAsResult.some((title) => /hyatt/i.test(title)), true);

const visible = modelVisibleTripContext(tripContext);
assert.equal(visible.tripReplyGate, undefined);
assert.deepEqual(visible.customerOwnLodgingContext, tripContext.customerOwnLodgingContext);
assert.equal(visible.citablePlaces, tripContext.citablePlaces);

const rules = await loadVacationAppReplyRules({ DATABASE_URL: '' });
const system = replyRulesSystem(rules, 'Maui', 'forbidden', false, customerTurn, { tripContext });
assert.match(system, /Customer's own lodging \(context only; not a search result; never recommend or describe it as a find\)/);
const savedLine = system.slice(system.indexOf('Saved trip record:'));
const recordJson = savedLine.slice('Saved trip record: '.length).split('\n')[0];
const record = JSON.parse(recordJson);
assert.equal(record.lodging, undefined);
assert.equal(record.tripReplyGate, undefined);
assert.equal(record.customerOwnLodgingContext.lodging, 'Hyatt Regency Maui');
assert.deepEqual(record.citablePlaces, tripContext.citablePlaces);
assert.equal(recordJson.indexOf('"citablePlaces"') < recordJson.indexOf('"customerOwnLodgingContext"'), true);
assert.equal(
  placeResultExtra(inTurnPlaceResults),
  'Results: Kihei Farmers Market; South Maui Farmers Market.',
);
assert.equal(system.includes('Results:'), false, 'Results line stays in systemExtra, not Saved trip record');

const request = replyRequestBody({
  rules,
  customerTurn,
  stage: 'vacation_conversation',
  screen: 'vacation-app',
  modelTier: 2,
  responseModel: 'qwen/qwen3-235b-a22b-2507',
  destination: 'Maui',
  memory: priorTurns.map((turn) => ({ role: turn.role, text: turn.text })),
  upsell: 'forbidden',
  tripContext,
});
assert.equal(request.trip_context.tripReplyGate, undefined);
assert.equal(request.trip_context.customerOwnLodgingContext.lodging, 'Hyatt Regency Maui');
assert.deepEqual(request.trip_context.citablePlaces, tripContext.citablePlaces);
assert.equal(JSON.stringify(request.trip_context).includes('[object Object]'), false);

const violations = [];
if (record.lodging !== undefined) violations.push('unlabelled top-level lodging key in saved trip record');
if (/tripReplyGate/.test(recordJson)) violations.push('saved trip record still exposes tripReplyGate');
if (/\[object Object\]/.test(recordJson)) violations.push('saved trip record stringifies gate rows');
if (!record.customerOwnLodgingContext?.label) violations.push('missing labelled lodging block');
assert.deepEqual(violations, []);

console.log(JSON.stringify({
  ok: true,
  checked: 'staging-smoke-m-place-search-prompt',
  citable: record.citablePlaces,
  lodgingBlock: record.customerOwnLodgingContext,
  resultsLine: placeResultExtra(inTurnPlaceResults),
}));
