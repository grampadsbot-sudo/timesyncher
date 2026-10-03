#!/usr/bin/env node
/**
 * Shepherd staging smoke check M: farmers market near Kihei after Hyatt + Westin lodging turns.
 * Rebuilds the place-search reply prompt/facts and asserts saved-trip lodging cues are gone.
 */
import assert from 'node:assert/strict';
import { draftingFacts, completeRosterParty } from '../src/vacation/live-app-turn.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { modelVisibleTripContext, placeResultExtra } from '../src/vacation/provider-result-context.mjs';
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

const drafting = draftingFacts(priorTurns, customerTurn, saved);
const tripContext = await enrichDraftingTripContext(drafting, {
  things,
  session: null,
  env: {},
  inTurnPlaceResults,
});
assert.equal(tripContext.lodging, undefined);
assert.equal(tripContext.statedLodgingArea, undefined);
assert.ok(Array.isArray(tripContext.tripReplyGate) && tripContext.tripReplyGate.length > 0, 'guard rows stay on full tripContext');
assert.deepEqual(tripContext.citablePlaces, [
  'Kihei Farmers Market',
  'South Maui Farmers Market',
]);
assert.equal(tripContext.notCitableAsResult.some((title) => /westin/i.test(title)), true);
assert.equal(tripContext.notCitableAsResult.some((title) => /hyatt/i.test(title)), true);

const visible = modelVisibleTripContext(tripContext);
assert.equal(visible.lodging, undefined);
assert.equal(visible.tripReplyGate, undefined);

const rules = await loadVacationAppReplyRules({ DATABASE_URL: '' });
const system = replyRulesSystem(rules, 'Maui', 'forbidden', false, customerTurn, { tripContext });
const savedLine = system.slice(system.indexOf('Saved trip record:'));
const recordJson = savedLine.slice('Saved trip record: '.length).split('\n')[0];
const record = JSON.parse(recordJson);
assert.equal(record.lodging, undefined);
assert.equal(record.tripReplyGate, undefined);
assert.deepEqual(record.citablePlaces, tripContext.citablePlaces);
assert.equal(
  placeResultExtra(inTurnPlaceResults),
  'Results: Kihei Farmers Market; South Maui Farmers Market.',
);

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
assert.equal(request.trip_context.lodging, undefined);
assert.equal(request.trip_context.tripReplyGate, undefined);
assert.deepEqual(request.trip_context.citablePlaces, tripContext.citablePlaces);

const violations = [];
if (/"lodging"\s*:/.test(recordJson)) violations.push('saved trip record still exposes lodging');
if (/tripReplyGate/.test(recordJson)) violations.push('saved trip record still exposes tripReplyGate');
if (/westin/i.test(recordJson) && !record.notCitableAsResult?.some((t) => /westin/i.test(t))) {
  violations.push('Westin appears outside notCitableAsResult');
}
assert.deepEqual(violations, []);

console.log(JSON.stringify({
  ok: true,
  checked: 'staging-smoke-m-place-search-prompt',
  citable: record.citablePlaces,
  resultsLine: placeResultExtra(inTurnPlaceResults),
}));
