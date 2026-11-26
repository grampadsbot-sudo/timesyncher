import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { computeTripMapInitialView } from '../src/vacation/trip-map-initial-view.mjs';

const rendered = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');

assert.equal(rendered.includes('Map appears when the day has mapped itinerary stops.'), false);
assert.match(rendered, /La\.length\?n\.jsx\("div",\{"data-ts-day-map"/);
assert.match(rendered, /Wo=\(\[G,Re\]\)=>tsUsableMapLatLng\(G,Re\)/);
assert.match(rendered, /function isUsableMapLatLng/);

const blockStart = rendered.indexOf('const MAP_CENTER_UNRESOLVED=');
const blockEnd = rendered.indexOf('const tsUsableMapLatLng=isUsableMapLatLng;') + 'const tsUsableMapLatLng=isUsableMapLatLng;'.length;
assert.ok(blockStart >= 0 && blockEnd > blockStart);
const evalHead = new Function(`
  ${rendered.slice(blockStart, blockEnd)}
  return tsTripMapInitialView({ places: [{ lat: 0, lng: 0 }], trip: { metadata: { destinationCenter: { lat: 28.5383, lng: -81.3792 } } } });
`);
const headCenter = evalHead();
assert.equal(headCenter.ok, true);
assert.equal(headCenter.mode, 'destination');

function legacyPointFromLatLng(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return { lat: la, lng: ln };
}
const legacyWouldCenterOnZero = legacyPointFromLatLng(0, 0);
assert.ok(legacyWouldCenterOnZero, 'start-commit logic treated 0,0 as valid');
const fixed = computeTripMapInitialView({
  places: [{ lat: 0, lng: 0 }],
  trip: { metadata: { destinationCenter: { lat: 28.5383, lng: -81.3792 } } },
});
assert.equal(fixed.ok, true);
assert.equal(fixed.mode, 'destination');

console.log('map usable coords bundle tests passed');