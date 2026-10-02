#!/usr/bin/env node
import assert from 'node:assert/strict';
import { replyRulesSystem } from '../scripts/vacation-app-reply-rules.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { citablePlaceTitles, placeResultExtra } from '../src/vacation/provider-result-context.mjs';

const inTurnResults = [
  { title: 'Kihei Caffe', name: 'Kihei Caffe' },
  { title: 'Java Café', name: 'Java Café' },
  { title: 'Kraken Coffee', name: 'Kraken Coffee' },
  { title: 'Lava Java Coffee Roasters of Maui.', name: 'Lava Java Coffee Roasters of Maui.' },
  { title: 'Akamai Coffee Co', name: 'Akamai Coffee Co', source: 'prior_db', relevanceRejected: true },
];

const citable = citablePlaceTitles(inTurnResults);
assert.deepEqual(citable, [
  'Kihei Caffe',
  'Java Café',
  'Kraken Coffee',
  'Lava Java Coffee Roasters of Maui',
]);
assert.equal(citable.some((title) => /akamai/i.test(title)), false);

const extra = placeResultExtra(inTurnResults);
assert.equal(
  extra,
  'Results: Kihei Caffe; Java Café; Kraken Coffee; Lava Java Coffee Roasters of Maui.',
);
assert.equal(/akamai/i.test(extra), false);

const facts = await enrichDraftingTripContext({
  itinerary: [
    'Kihei Caffe',
    'Akamai Coffee Co.',
    'Java Café',
    'Kraken Coffee',
    'Lava Java Coffee Roasters of Maui',
  ],
  survivingPriorDbTitles: ['Akamai Coffee Co'],
  relevanceRejections: [{ title: 'Akamai Coffee Co', source: 'prior_db' }],
  priorPlaces: ['Akamai Coffee Co.'],
}, {
  inTurnPlaceResults: inTurnResults,
  env: {},
});

assert.deepEqual(facts.citablePlaces, citable);
assert.deepEqual(facts.itinerary, [
  'Kihei Caffe',
  'Java Café',
  'Kraken Coffee',
  'Lava Java Coffee Roasters of Maui',
]);
assert.equal(facts.itinerary.some((title) => /akamai/i.test(title)), false);
assert.deepEqual(facts.notCitableAsResult, ['Akamai Coffee Co']);
assert.match(facts.notCitableAsResultRule, /Cite only citablePlaces/);
assert.equal(facts.survivingPriorDbTitles, undefined);
assert.equal(facts.relevanceRejections, undefined);
assert.equal(facts.priorPlaces, undefined);

const system = replyRulesSystem({}, 'Maui', false, false, 'coffee near the hotel', { tripContext: facts });
assert.match(system, /notCitableAsResult places are not results from this turn/);
assert.match(system, /Kihei Caffe/);
const saved = system.slice(system.indexOf('Saved trip record:'));
const record = JSON.parse(saved.slice('Saved trip record: '.length).split('\n')[0]);
assert.deepEqual(record.citablePlaces, citable);
assert.equal(record.itinerary.some((title) => /akamai/i.test(title)), false);
assert.deepEqual(record.notCitableAsResult, ['Akamai Coffee Co']);
assert.equal(record.survivingPriorDbTitles, undefined);
assert.equal(record.relevanceRejections, undefined);
assert.equal(record.priorPlaces, undefined);

console.log(JSON.stringify({ ok: true, checked: 'in-turn-citable-places', citable }));
