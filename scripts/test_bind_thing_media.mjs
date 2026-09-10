import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { requireMediaBindAuth, stagingMediaBindHost } from '../src/vacation/auth.mjs';
import {
  SCT_VACATION3_MEDIA_PACK,
  chooseMediaStorage,
  guessThingNameFromFilename,
  mapVacation3SctMediaFile,
  mergeBindingsIntoShared,
  neonRawMediaPath,
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
assert.equal(guessThingNameFromFilename('boarding-passes-photo.jpg').thingName, 'SFO to LAS');
assert.equal(guessThingNameFromFilename('high-roller.jpg').missing, true);
assert.equal(guessThingNameFromFilename('sphere-show.jpg').missing, true);

assert.equal(SCT_VACATION3_MEDIA_PACK.length, 15);
const carboneHands = mapVacation3SctMediaFile('carbone-late-hands-photo.jpg');
assert.equal(carboneHands.action, 'bind');
assert.equal(carboneHands.targets[0].thingId, 8872);
const boarding = mapVacation3SctMediaFile('/workspace/sct-runs/story-draft-20260907/media/boarding-passes-photo.jpg');
assert.equal(boarding.action, 'bind');
assert.deepEqual(boarding.targets.map((row) => row.thingId), [8877, 8878]);
assert.equal(mapVacation3SctMediaFile('conservatory-photo.jpg').targets[0].thingId, 8871);
assert.equal(mapVacation3SctMediaFile('shake-shack-fries-photo.jpg').targets[0].thingId, 8873);
assert.equal(mapVacation3SctMediaFile('eggslut-sandwich-photo.jpg').targets[0].thingId, 8875);
assert.equal(mapVacation3SctMediaFile('bellagio-fountain-late-video.mp4').targets[0].thingId, 8869);
assert.equal(mapVacation3SctMediaFile('bellagio-fountain-night-video.mp4').targets[0].thingId, 8869);
assert.equal(mapVacation3SctMediaFile('cirque-program-photo.jpg').action, 'skip');
assert.equal(mapVacation3SctMediaFile('high-roller-photo-01.jpg').action, 'skip');
assert.equal(mapVacation3SctMediaFile('high-roller-photo-02.jpg').action, 'skip');
assert.equal(mapVacation3SctMediaFile('high-roller-photo-03.jpg').action, 'skip');
assert.equal(mapVacation3SctMediaFile('sphere-late-photo-01.jpg').action, 'skip');
assert.equal(mapVacation3SctMediaFile('sphere-late-photo-02.jpg').action, 'skip');
assert.equal(mapVacation3SctMediaFile('sphere-led-video.mp4').action, 'skip');

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

const pngBytes = proofPngBuffer({ label: 'neon' });
const neonChoice = chooseMediaStorage({
  bytes: pngBytes,
  sourceUrl: '',
  blobUrl: '',
  hasDatabase: true,
  origin: 'https://vacation-staging.timesyncher.com',
  shareToken: 'las-vegas-vacation-3',
  bindingId: 'bind-neon-1',
});
assert.equal(neonChoice.storageProvider, 'neon');
assert.equal(neonChoice.storeBytes, true);
assert.equal(neonChoice.publicUrl, `https://vacation-staging.timesyncher.com${neonRawMediaPath('las-vegas-vacation-3', 'bind-neon-1')}`);

const urlChoice = chooseMediaStorage({
  bytes: null,
  sourceUrl: 'https://vacation-staging.timesyncher.com/ts-thing-media/las-vegas-vacation-3/carbone-bind-proof.png',
  hasDatabase: true,
});
assert.equal(urlChoice.storageProvider, 'url');
assert.equal(urlChoice.storeBytes, false);

const noStore = chooseMediaStorage({ bytes: pngBytes, hasDatabase: false, blobUrl: '' });
assert.equal(noStore.error, 'no-store');

const handler = await readFile(new URL('../src/vacation/bind-thing-media-handler.mjs', import.meta.url), 'utf8');
assert.match(handler, /chooseMediaStorage/);
assert.match(handler, /getBindingMedia/);
assert.match(handler, /storeBytes/);

const store = await readFile(new URL('../src/vacation/thing-media-store.mjs', import.meta.url), 'utf8');
assert.match(store, /file_bytes bytea/);
assert.match(store, /catch \{\s*return null;/);

console.log('thing media bind tests passed');
