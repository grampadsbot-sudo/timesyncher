import assert from 'node:assert/strict';
import fs from 'node:fs';

import { applyThingPresentation } from '../src/vacation/intake-shared-trip.mjs';
import { applyProductKeepsakeOverrides, resolveThingCoords } from '../src/vacation/keepsake-product-overrides.mjs';
import { mergeBindingsIntoShared } from '../src/vacation/thing-media-bind.mjs';
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
    { id: 11, name: 'Sample Venue' },
    { id: 12, name: 'Sample Cafe' },
    { id: 13, name: 'Sample Grill' },
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
    name: 'Sample Venue',
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

assert.equal(resolveThingCoords({ name: 'Sample Venue', address: 'Sample City' }), null);
assert.equal(resolveThingCoords({ name: 'Sample Cafe', address: 'Sample Road' }), null);
assert.deepEqual(resolveThingCoords({
  name: 'Sample Venue',
  sourceRecord: { latitude: 10, longitude: 20, neighborhood: 'Sample Area' },
}), [10, 20]);

const blankThing = applyProductKeepsakeOverrides({
  places: [{ id: 30, name: 'Sample Venue', category_name: 'Restaurant' }],
});
assert.equal(blankThing.thingOverrides['place:30'].summary, undefined);
assert.equal(blankThing.thingOverrides['place:30'].longDetails, undefined);
assert.equal(blankThing.thingOverrides['place:30'].neighborhood, undefined);
assert.equal(blankThing.thingOverrides['place:30'].happyHour, undefined);
assert.equal(blankThing.thingOverrides['place:30'].lat, undefined);

const sourcedThing = applyProductKeepsakeOverrides({
  places: [{
    id: 31,
    name: 'Sample Venue',
    category_name: 'Restaurant',
    source: {
      lat: 10,
      lng: 20,
      neighborhood: 'Sample Area',
      summary: 'From the source record',
      happyHour: false,
      happyHourDetails: 'No happy hour on the record',
      restaurantTags: ['italian'],
    },
  }],
});
assert.equal(sourcedThing.thingOverrides['place:31'].summary, 'From the source record');
assert.equal(sourcedThing.thingOverrides['place:31'].neighborhood, 'Sample Area');
assert.equal(sourcedThing.thingOverrides['place:31'].happyHour, false);
assert.equal(sourcedThing.thingOverrides['place:31'].happyHourDetails, 'No happy hour on the record');
assert.deepEqual(sourcedThing.thingOverrides['place:31'].restaurantTags, ['italian']);
assert.equal(sourcedThing.thingOverrides['place:31'].lat, 10);
assert.equal(sourcedThing.thingOverrides['place:31'].lng, 20);

const mediaBindSource = fs.readFileSync(new URL('../src/vacation/thing-media-bind.mjs', import.meta.url), 'utf8');
const mediaBindCli = fs.readFileSync(new URL('../scripts/bind-thing-media.mjs', import.meta.url), 'utf8');
for (const symbol of ['SCT_VACATION3_MEDIA_PACK', 'THINGS_NOT_ON_VACATION3', 'VACATION3_SHARE_TOKEN', 'SCT_VACATION3_MEDIA_DIR']) {
  assert.equal(mediaBindSource.includes(symbol), false, symbol);
  assert.equal(mediaBindCli.includes(symbol), false, symbol);
}
const mediaTrip = {
  places: [
    { id: 11, name: 'Sample Venue', image_url: null },
    { id: 12, name: 'Sample Cafe' },
  ],
};
const noMedia = mergeBindingsIntoShared(mediaTrip, []);
assert.equal(noMedia.places[0].image_url, null);
assert.equal(noMedia.media.length, 0);
const unnamed = mergeBindingsIntoShared(mediaTrip, [{
  id: 'file-only',
  originalName: 'venue-a-photo.jpg',
  publicUrl: '/media/venue-a-photo.jpg',
}]);
assert.equal(unnamed.places[0].image_url, null);
assert.equal(unnamed.places[0].bound_media, undefined);
const sourced = mergeBindingsIntoShared(mediaTrip, [{
  id: 'from-source',
  thingId: 11,
  thingName: 'Sample Venue',
  publicUrl: 'https://cdn.example/venue-a-photo.jpg',
  mimeType: 'image/jpeg',
  originalName: 'venue-a-photo.jpg',
}]);
assert.equal(sourced.places[0].image_url, 'https://cdn.example/venue-a-photo.jpg');
assert.equal(sourced.places[1].image_url, undefined);
assert.equal(sourced.places[1].bound_media, undefined);

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
assert.match(patched, /return\[1,2\];const tsNamedCoord=is\(G\);return tsNamedCoord\|\|null/);
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
    { id: 1, name: 'Dinner', source: { neighborhood: 'Sample Area' } },
    { id: 2, name: 'No neighborhood' },
  ],
  [{ id: 9, title: 'Walk', neighborhood: 'Other Area' }],
  {},
);
assert.deepEqual(chips, ['Sample Area', 'Other Area']);

const Sn = new Function('Ke', 'le', `${sliceBetween(patched, 'Sn=(G,Re)=>', 'return named||"Citywide / Flexible"}')}; return Sn`)([], {});
assert.equal(Sn('Unused Label', { id: 2, name: 'No neighborhood' }), 'Citywide / Flexible');
assert.equal(Sn('', { id: 1, name: 'Dinner', source: { neighborhood: 'Sample Area' } }), 'Sample Area');
assert.equal(Sn('Harbor', { id: 4, name: 'Pier' }), 'Citywide / Flexible');
assert.equal(new Function('Ke', 'le', `${sliceBetween(patched, 'Sn=(G,Re)=>', 'return named||"Citywide / Flexible"}')}; return Sn`)(['Harbor'], {})('Harbor', { id: 4, name: 'Pier' }), 'Harbor');

process.stdout.write('hardcoded product content test passed\n');
