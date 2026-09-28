import assert from 'node:assert/strict';
import fs from 'node:fs';

import { applyThingPresentation } from '../src/vacation/intake-shared-trip.mjs';
import { applyProductKeepsakeOverrides, resolveThingCoords } from '../src/vacation/keepsake-product-overrides.mjs';
import { guessThingNameFromFilename, mapVacation3SctMediaFile } from '../src/vacation/thing-media-bind.mjs';
import { STYLE2_USES_ZU, patchStyleTwoToConfigRenderer } from '../src/vacation/trek-style2-bundle.mjs';

const bundleText = fs.readFileSync(new URL('../src/vacation/trek-style2-bundle.mjs', import.meta.url), 'utf8');

function constString(name) {
  const match = bundleText.match(new RegExp(`const ${name} = '([^']*)';`));
  assert.ok(match, name);
  return match[1];
}

const namedOnly = applyThingPresentation({
  trip: { id: 'g2', title: 'Trip' },
  places: [
    { id: 11, name: 'Ulu Ocean Grill' },
    { id: 12, name: "Huggo's" },
    { id: 13, name: 'Fish Hopper' },
  ],
});
for (const id of [11, 12, 13]) {
  const extra = namedOnly.thingOverrides[`place:${id}`];
  assert.equal(extra.restaurantTags, undefined);
  assert.equal(extra.happyHour, undefined);
  assert.equal(extra.happyHourDetails, undefined);
}
const fromRecord = applyThingPresentation({
  trip: { id: 'g2', title: 'Trip' },
  places: [{
    id: 21,
    name: 'Ulu Ocean Grill',
    source: {
      restaurantTags: ['oceanfront'],
      happyHour: true,
      happyHourDetails: '4-6pm from the record',
    },
  }],
});
assert.deepEqual(fromRecord.thingOverrides['place:21'].restaurantTags, ['oceanfront']);
assert.equal(fromRecord.thingOverrides['place:21'].happyHour, true);
assert.equal(fromRecord.thingOverrides['place:21'].happyHourDetails, '4-6pm from the record');

assert.equal(resolveThingCoords({ name: 'Bellagio', address: 'Las Vegas' }), null);
assert.equal(resolveThingCoords({ name: 'Shake Shack', address: 'Las Vegas Strip' }), null);
assert.deepEqual(resolveThingCoords({
  name: 'Bellagio',
  sourceRecord: { latitude: 36.1126, longitude: -115.1767, neighborhood: 'Strip' },
}), [36.1126, -115.1767]);

const blankThing = applyProductKeepsakeOverrides({
  places: [{ id: 30, name: 'Carbone', category_name: 'Restaurant' }],
});
assert.equal(blankThing.thingOverrides['place:30'].summary, undefined);
assert.equal(blankThing.thingOverrides['place:30'].longDetails, undefined);
assert.equal(blankThing.thingOverrides['place:30'].neighborhood, undefined);
assert.equal(blankThing.thingOverrides['place:30'].happyHour, undefined);
assert.equal(blankThing.thingOverrides['place:30'].lat, undefined);

const sourcedThing = applyProductKeepsakeOverrides({
  places: [{
    id: 31,
    name: 'Carbone',
    category_name: 'Restaurant',
    source: {
      lat: 36.1073,
      lng: -115.1766,
      neighborhood: 'Aria',
      summary: 'From the source record',
      happyHour: false,
      happyHourDetails: 'No happy hour on the record',
      restaurantTags: ['italian'],
    },
  }],
});
assert.equal(sourcedThing.thingOverrides['place:31'].summary, 'From the source record');
assert.equal(sourcedThing.thingOverrides['place:31'].neighborhood, 'Aria');
assert.equal(sourcedThing.thingOverrides['place:31'].happyHour, false);
assert.equal(sourcedThing.thingOverrides['place:31'].happyHourDetails, 'No happy hour on the record');
assert.deepEqual(sourcedThing.thingOverrides['place:31'].restaurantTags, ['italian']);
assert.equal(sourcedThing.thingOverrides['place:31'].lat, 36.1073);
assert.equal(sourcedThing.thingOverrides['place:31'].lng, -115.1766);

const conservatory = mapVacation3SctMediaFile('conservatory-photo.jpg');
assert.equal(conservatory.action, 'needs-attachment');
assert.deepEqual(conservatory.targets, []);
for (const file of [
  'bellagio-fountain-late-video.mp4',
  'bellagio-fountain-night-video.mp4',
  'hotel-lobby.jpg',
  'lodging-photo.jpg',
  'carbone-late-hands-photo.jpg',
  'shake-shack-fries-photo.jpg',
  'eggslut-sandwich-photo.jpg',
  'boarding-passes-photo.jpg',
]) {
  assert.equal(guessThingNameFromFilename(file).thingName, '');
  const mapped = mapVacation3SctMediaFile(file);
  assert.notEqual(mapped.action, 'bind');
  assert.deepEqual(mapped.targets, []);
}

const areaList = constString('AREA_CHIP_NYC').slice('Ya='.length);
const areaFallback = constString('AREA_FALLBACK_NEEDLE');
const coordNeedle = constString('COORD_NAME_MAP_NEEDLE');
const flightSlot = 'Rn=((Xr=(sr=String(bi(G)||"").match(/\\$\\s?\\d[\\d,]*/))==null?void 0:sr[0])==null?void 0:Xr.replace(/\\s+/g,""))||"unpriced"';
const rentalSlot = 'children:ie(G)||"unpriced"';
const fixture = [
  STYLE2_USES_ZU,
  `Ke=${areaList}`,
  areaFallback,
  `ho=G=>{return[1,2];${coordNeedle}}`,
  flightSlot,
  rentalSlot,
].join('\n');
const patched = patchStyleTwoToConfigRenderer(fixture);
assert.equal(patched.includes(areaList), false);
assert.equal(patched.includes(areaFallback), false);
assert.equal(patched.includes(coordNeedle), false);
assert.equal(patched.includes('||"unpriced"'), false);
assert.match(patched, /src\.neighborhood/);
assert.match(patched, /return\[1,2\];return null/);
assert.match(patched, /children:ie\(G\)\|\|""/);
const flightLine = patched.split('\n').find((line) => line.startsWith('Rn='));
assert.equal(new Function('bi', 'G', `${flightLine}; return Rn`)(() => '', {}), '');
assert.equal(new Function('bi', 'G', `${flightLine}; return Rn`)(() => '$18', {}), '$18');
assert.equal(new Function('ie', 'G', 'return ie(G)||""')(() => '', {}), '');
assert.equal(new Function('ie', 'G', 'return ie(G)||""')(() => '$40', {}), '$40');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(end >= 0, endMarker);
  return source.slice(start, end + endMarker.length);
}

const chipExpr = sliceBetween(patched, '(function(){const key=', 'return chips})()');
const chips = new Function('Gt', 'Ut', 'le', `return ${chipExpr}`)(
  [
    { id: 1, name: 'Dinner', source: { neighborhood: 'Alii Drive' } },
    { id: 2, name: 'No neighborhood' },
  ],
  [{ id: 9, title: 'Walk', neighborhood: 'Keauhou' }],
  {},
);
assert.deepEqual(chips, ['Alii Drive', 'Keauhou']);

const Sn = new Function('Ke', 'le', `${sliceBetween(patched, 'Sn=(G,Re)=>', 'return a&&Ke.includes(a)?a:""}')}; return Sn`)([], {});
assert.equal(Sn('Citywide / Flexible', { id: 2, name: 'No neighborhood' }), '');
assert.equal(Sn('', { id: 1, name: 'Dinner', source: { neighborhood: 'Aria' } }), 'Aria');
assert.equal(Sn('Harbor', { id: 4, name: 'Pier' }), '');

process.stdout.write('hardcoded product content test passed\n');
