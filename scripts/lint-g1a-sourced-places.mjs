#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sourcedPlaceRule } from './vacation-app-reply-rules.mjs';
import { placeSourceRows, unsourcedPlaces } from '../src/vacation/live-app-turn.mjs';

const TRIP_LITERALS = /\b(Big Island|Kailua-Kona|Kimberly|Tyler|Lauren|Craig|Vegas|April|Waikiki)\b/;
const VENUE_BLACKLIST = /INVENTED_GARDEN|UNNAMED_VENUE|inventedGardenHit|kahalu|keauhou|pu['ʻ‘’]?uhonua|honaunau|thurston|captain cook|pua mau|botanical garden|lava tube|arboretum/i;
const OLD_PLACE_BAN = /use only places, activities, and venues the customer already named|Do not invent a cruise/;

const turnSource = fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const rulesSource = fs.readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
const placeCheck = turnSource.slice(
  turnSource.indexOf('export function placeSourceRows'),
  turnSource.indexOf('\nconst MONTHS'),
);
const placeRule = rulesSource.slice(
  rulesSource.indexOf('export function sourcedPlaceRule'),
  rulesSource.indexOf('\nfunction replyRulesSystem'),
);

assert.ok(placeCheck.includes('export function unsourcedPlaces'), 'place id check is missing');
assert.ok(placeRule.includes('(id:THAT_ID)'), 'sourced place rule is missing');
assert.doesNotMatch(placeCheck, TRIP_LITERALS, 'place id check still has a trip literal');
assert.doesNotMatch(placeRule, TRIP_LITERALS, 'sourced place rule still has a trip literal');
assert.doesNotMatch(sourcedPlaceRule(), TRIP_LITERALS);
assert.doesNotMatch(turnSource, VENUE_BLACKLIST, 'venue blacklist returned');
assert.doesNotMatch(rulesSource, OLD_PLACE_BAN, 'customer-named-only place ban returned');
assert.doesNotMatch(placeCheck, /Big Island/);
assert.doesNotMatch(placeRule, /Big Island/);

const sourced = [{ id: 'osm:way/11', name: 'Harbor Market' }];
assert.deepEqual(placeSourceRows([{ poiId: 'fsq:1', title: 'North Cafe' }]), [{ id: 'fsq:1', name: 'North Cafe' }]);
assert.deepEqual(unsourcedPlaces('Harbor Market (id:osm:way/11) fits Tuesday.', sourced), []);
assert.deepEqual(unsourcedPlaces('Glass Lagoon (id:missing) fits Tuesday.', sourced), ['Glass Lagoon']);
assert.deepEqual(unsourcedPlaces('Harbor Market fits Tuesday.', sourced), ['Harbor Market']);
assert.deepEqual(unsourcedPlaces('Monday swim is the beach or the house pool.', []), []);

console.log('g1a sourced places ok');
