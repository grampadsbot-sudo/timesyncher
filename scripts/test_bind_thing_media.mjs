import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { requireMediaBindAuth, stagingMediaBindHost } from '../src/vacation/auth.mjs';
import {
  chooseMediaStorage,
  mergeBindingsIntoShared,
  isKeepsakeJunkMedia,
  stripKeepsakeJunkMedia,
  proofPngBuffer,
  resolveThingFromShared,
  isPhotoBinding,
  isVideoBinding,
  isFunctionMediaProxyUrl,
  resolveDirectMediaPublicUrl,
  sniffMediaType,
  toPublicBinding,
} from '../src/vacation/thing-media-bind.mjs';

const shared = {
  trip: { id: 41, title: 'Sample Trip' },
  media: [],
  places: [
    { id: 11, trip_id: 41, name: 'Sample Venue', category_name: 'Restaurant', image_url: null },
    { id: 12, trip_id: 41, name: 'Sample Cafe', category_name: 'Restaurant' },
    { id: 13, trip_id: 41, name: 'Sample Hall', category_name: 'Attraction' },
  ],
  days: [{ id: 1, day_number: 1 }],
  assignments: {
    1: [{ id: 1, place: { id: 11, name: 'Sample Venue' } }],
  },
  thingOverrides: {
    'place:13': { title: 'Sample Hall Evening', category: 'other' },
  },
};

assert.equal(resolveThingFromShared(shared, { thingName: 'Sample Venue' }).thingId, 11);
assert.equal(resolveThingFromShared(shared, { thingId: 11 }).name, 'Sample Venue');
assert.equal(resolveThingFromShared(shared, { thingName: 'Sample Hall' }).thingId, 13);

const bindSource = await readFile(new URL('../src/vacation/thing-media-bind.mjs', import.meta.url), 'utf8');
const bindCli = await readFile(new URL('../scripts/bind-thing-media.mjs', import.meta.url), 'utf8');
for (const symbol of ['SCT_VACATION3_MEDIA_PACK', 'THINGS_NOT_ON_VACATION3', 'VACATION3_SHARE_TOKEN']) {
  assert.equal(bindSource.includes(symbol), false, symbol);
  assert.equal(bindCli.includes(symbol), false, symbol);
}
const absent = mergeBindingsIntoShared(shared, [{
  id: 'bind-missing',
  publicUrl: '/ts-thing-media/sample-trip/venue-b-photo.png',
  thingName: 'Sample Venue',
}]);
assert.equal(absent.places[0].image_url, null);
assert.equal(absent.media.length, 0);
assert.equal(absent.places[0].bound_media, undefined);

const merged = mergeBindingsIntoShared(shared, [{
  id: 'bind-1',
  shareToken: 'sample-trip',
  thingId: 11,
  thingName: 'Sample Venue',
  publicUrl: '/ts-thing-media/sample-trip/venue-a-bind-proof.png',
  mimeType: 'image/png',
  originalName: 'venue-a-bind-proof.png',
}]);
assert.equal(merged.places[0].image_url, '/ts-thing-media/sample-trip/venue-a-bind-proof.png');
assert.equal(merged.media[0].place_id, 11);
assert.match(merged.media[0].url, /venue-a-bind-proof/);
assert.equal(isKeepsakeJunkMedia(merged.media[0]), true);
const printShared = stripKeepsakeJunkMedia(merged);
assert.equal(printShared.media.length, 0);
assert.equal(printShared.places[0].image_url, null);

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

const itinerary = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(itinerary, /mediaBind/);
assert.match(itinerary, /trekPath/);
assert.match(itinerary, /pdfQr/);
assert.match(itinerary, /handlePdfQrSvg/);

const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
assert.match(vercel, /shared&trekPath/);
assert.match(vercel, /bind-thing-media/);

const overlay = await readFile(new URL('../public/ts-thing-media-overlay.js', import.meta.url), 'utf8');
assert.match(overlay, /bind-thing-media/);
assert.match(overlay, /DETAIL PAGE/);
assert.doesNotMatch(overlay, /document\.write/);
assert.doesNotMatch(overlay, /style=2/);
assert.match(vercel, /keepsakePdf/);
assert.match(vercel, /\/api\/pdf\/shared/);

const pngBytes = proofPngBuffer({ label: 'neon' });
const blobRequired = chooseMediaStorage({
  bytes: pngBytes,
  sourceUrl: '',
  blobUrl: '',
  hasDatabase: true,
});
assert.equal(blobRequired.error, 'blob-required');
assert.equal(blobRequired.publicUrl, '');

const urlChoice = chooseMediaStorage({
  bytes: null,
  sourceUrl: 'https://cdn.example/venue-a-photo.png',
  hasDatabase: true,
});
assert.equal(urlChoice.storageProvider, 'url');
assert.equal(urlChoice.storeBytes, false);

const noStore = chooseMediaStorage({ bytes: pngBytes, hasDatabase: false, blobUrl: '' });
assert.equal(noStore.error, 'no-store');

const mislabeled = toPublicBinding({
  id: '6ba36f2a-e9f2-467e-9e61-3aac64fe165a',
  thingId: 14,
  mediaKind: 'photo',
  mimeType: 'application/octet-stream',
  originalName: 'venue-b-video.mp4',
  publicUrl: 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=sample-trip&id=6ba36f2a-e9f2-467e-9e61-3aac64fe165a&raw=1',
});
assert.equal(mislabeled.mediaKind, 'video');
assert.equal(mislabeled.mimeType, 'video/mp4');
assert.equal(isVideoBinding(mislabeled), true);
assert.equal(isPhotoBinding(mislabeled), false);
assert.equal(isPhotoBinding({
  mediaKind: 'photo',
  mimeType: 'application/octet-stream',
  originalName: 'venue-b-video.mp4',
  publicUrl: mislabeled.publicUrl,
}), false);
assert.equal(sniffMediaType(Buffer.from('....ftypisom........'), 'x.bin', 'application/octet-stream'), 'video/mp4');
assert.equal(isFunctionMediaProxyUrl('https://x/api/vacation-telegram-turn?action=media-download'), true);
assert.equal(isFunctionMediaProxyUrl('https://cdn.blob.vercel-storage.com/x.jpg'), false);
assert.equal(resolveDirectMediaPublicUrl({
  id: 'b1',
  publicUrl: 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=t&id=1&raw=1',
  metadata: { blobUrl: 'https://abc.public.blob.vercel-storage.com/photo.jpg' },
}), 'https://abc.public.blob.vercel-storage.com/photo.jpg');

const hotelShared = {
  trip: { id: 41 },
  media: [],
  places: [{ id: 14, name: 'Sample Hotel', category_name: 'Hotel', image_url: null }],
};
const hotelMerged = mergeBindingsIntoShared(hotelShared, [mislabeled]);
assert.ok(!hotelMerged.places[0].image_url);

const handler = await readFile(new URL('../src/vacation/bind-thing-media-handler.mjs', import.meta.url), 'utf8');
assert.match(handler, /chooseMediaStorage/);
assert.match(handler, /getBindingMedia/);
assert.match(handler, /sendCachedBindingMedia/);
assert.match(handler, /raw/);
assert.doesNotMatch(handler, /410/);
assert.match(handler, /storeBytes/);
assert.match(handler, /sniffMediaType/);

const store = await readFile(new URL('../src/vacation/thing-media-store.mjs', import.meta.url), 'utf8');
assert.match(store, /file_bytes bytea/);
assert.match(store, /getBindingMedia/);
assert.match(store, /catch \{\s*return null;/);

console.log('thing media bind tests passed');
