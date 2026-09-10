import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { requireMediaBindAuth, stagingMediaBindHost } from '../src/vacation/auth.mjs';
import {
  guessThingNameFromFilename,
  mergeBindingsIntoShared,
  proofPngBuffer,
  resolveThingFromShared,
} from '../src/vacation/thing-media-bind.mjs';

const shared = {
  trip: { id: 197, title: 'Las Vegas Vacation' },
  media: [],
  places: [
    { id: 8872, trip_id: 197, name: 'Carbone at Aria', category_name: 'Restaurant', image_url: null },
    { id: 8873, trip_id: 197, name: 'Shake Shack near Cosmo/Aria', category_name: 'Restaurant' },
    { id: 8871, trip_id: 197, name: 'Las Vegas restaurants, activities, and shopping research queue', category_name: 'Attraction' },
  ],
  days: [{ id: 1236, day_number: 1 }],
  assignments: {
    1236: [{ id: 1, place: { id: 8872, name: 'Carbone at Aria' } }],
  },
  thingOverrides: {
    'place:8871': { title: 'Bellagio Conservatory — Anniversary Cocktails', category: 'other' },
  },
};

assert.equal(resolveThingFromShared(shared, { thingName: 'Carbone' }).thingId, 8872);
assert.equal(resolveThingFromShared(shared, { thingId: 8872 }).name, 'Carbone at Aria');
assert.equal(resolveThingFromShared(shared, { thingName: 'Conservatory' }).thingId, 8871);
assert.equal(guessThingNameFromFilename('carbone-dinner.jpg').thingName, 'Carbone');
assert.equal(guessThingNameFromFilename('high-roller.jpg').missing, true);
assert.equal(guessThingNameFromFilename('sphere-show.jpg').missing, true);

const merged = mergeBindingsIntoShared(shared, [{
  id: 'bind-1',
  shareToken: 'las-vegas-vacation-3',
  thingId: 8872,
  thingName: 'Carbone at Aria',
  publicUrl: '/ts-thing-media/las-vegas-vacation-3/carbone-bind-proof.png',
  mimeType: 'image/png',
  originalName: 'carbone-bind-proof.png',
}]);
assert.equal(merged.places[0].image_url, '/ts-thing-media/las-vegas-vacation-3/carbone-bind-proof.png');
assert.equal(merged.media[0].place_id, 8872);
assert.match(merged.media[0].url, /carbone-bind-proof/);

const png = proofPngBuffer({ label: 'test' });
assert.equal(png.subarray(0, 8).toString('binary'), '\x89PNG\r\n\x1a\n');

assert.equal(stagingMediaBindHost('something.vercel.app'), true);
assert.equal(stagingMediaBindHost('vacation-staging.timesyncher.com'), true);
assert.equal(stagingMediaBindHost('travel.timesyncher.com'), false);

assert.throws(
  () => requireMediaBindAuth({ headers: { host: 'timesyncher.com' } }, {}),
  /TIMESYNCHER_MEDIA_BIND_TOKEN/,
);
assert.deepEqual(
  requireMediaBindAuth({ headers: { host: 'preview.vercel.app' } }, {}),
  { mode: 'staging-open' },
);
assert.deepEqual(
  requireMediaBindAuth({
    headers: { host: 'timesyncher.com', authorization: 'Bearer secret' },
  }, { TIMESYNCHER_MEDIA_BIND_TOKEN: 'secret' }),
  { mode: 'token' },
);

const api = await readFile(new URL('../src/vacation/bind-thing-media-handler.mjs', import.meta.url), 'utf8');
assert.match(api, /\/api\/bind-thing-media/);
assert.match(api, /shareToken/);
assert.match(api, /sourceUrl/);

const itinerary = await readFile(new URL('../api/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(itinerary, /mediaBind/);
assert.match(itinerary, /trekPath/);

const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
assert.match(vercel, /vacation-itinerary\?trekPath/);
assert.match(vercel, /bind-thing-media/);

const overlay = await readFile(new URL('../public/ts-thing-media-overlay.js', import.meta.url), 'utf8');
assert.match(overlay, /\/shared\/.*\/journey/);
assert.match(overlay, /bind-thing-media/);

console.log('thing media bind tests passed');
