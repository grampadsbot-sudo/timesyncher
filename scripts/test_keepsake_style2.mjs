import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { buildStyle2Model, renderStyle2Html, realTripSummary, BOILERPLATE_RE, pickStoryCover, PRODUCT_SOT_SLUG, PRODUCT_SOT_ALIAS, PRODUCT_SOT_TWIN, PRODUCT_SOT_RECEIPT } from '../src/vacation/keepsake-style2.mjs';
import { applyCapturedLogos, captureThingLogo, thingCreateLogoFields, isBoundStoryMediaUrl, sourceLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import { isAirplaneGlyph, timelineIcon } from '../src/vacation/timeline-icons.mjs';
import { backfillAssignments, itineraryMinThings } from '../src/vacation/itinerary-minimums.mjs';
import { qrModules, qrSvg } from '../src/vacation/qr-svg.mjs';
import handlePdfQrSvg, { allowedQrPayload, PDF_QR_SIZE } from '../src/vacation/pdf-qr-svg-handler.mjs';
import { isKeepsakeJunkMedia, stripKeepsakeJunkMedia, mergeBindingsIntoShared, printDataUrlForPublicFile, publicMediaDiskPath, PRINT_STUB_MAX_BYTES } from '../src/vacation/thing-media-bind.mjs';
import {
  isJourneyBookReport,
  journeyBookGate,
  isProductStyleTwo,
  isProductStyleOne,
  normalizeReportName,
  productPdfUrl,
  productStyleTwoViewUrl,
  productStyleOneViewUrl,
  wantsStyleTwoView,
  PRODUCT_STYLE_TWO_REPORT,
  PRODUCT_STYLE_ONE_REPORT,
  getProductTrekPublic,
  PRODUCT_SOT,
  PRODUCT_SOT_TWIN as HANDLER_SOT_TWIN,
  forwardedKeepsakeSearch,
  styleTwoLocationStaysOnStaging,
  styleOneLocationStaysOnStaging,
} from '../src/vacation/keepsake-style2-handler.mjs';
import keepsakeStyle2Handler from '../src/vacation/keepsake-style2-handler.mjs';
import { patchStyleTwoToConfigRenderer, assertPatchedStyleTwo, assertStyleTwoPatchParses, STYLE2_USES_AE, STYLE2_USES_ZU } from '../src/vacation/trek-style2-bundle.mjs';
import { applyProductKeepsakeOverrides, keepsakeListBuckets, resolveThingCoords } from '../src/vacation/keepsake-product-overrides.mjs';
import { KEEPSAKE_LIST_MINIMUMS } from '../src/vacation/keepsake-list-minimums.mjs';
import { DEFAULT_FIRST_PASS_MINIMUMS } from '../scripts/vacation-public-research-worker.mjs';
process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://trek-preview.example.com';
const shared = {
  trip: {
    id: 197,
    title: 'Sample trip',
    description: 'Notes from the trip record.',
  },
  days: [
    { id: 1236, day_number: 1 },
    { id: 1237, day_number: 2 },
  ],
  thingOverrides: {
    'place:8871': { title: 'Sample place A', category: 'other', story: 'The air smelled like wet petals and cold gin.' },
    'place:8872': { story: 'Spicy rigatoni split down the middle.' },
    'place:8873': { story: 'Paper boat of fries after the heat.' },
    'place:8869': { title: 'Sample place B', category: 'hotel', story: 'Fountain spray lit gold outside the glass.' },
  },
  places: [
    { id: 8872, name: 'Sample place C', category_name: 'Restaurant', category_icon: '🍽️', image_url: '/ts-thing-media/sample-trip/venue-c-plates-photo.jpg' },
    { id: 8873, name: 'Sample place D', category_name: 'Restaurant', category_icon: '🍽️' },
    { id: 8876, name: 'Sample place E', category_name: 'Store', category_icon: 'ShoppingBag' },
    { id: 8871, name: 'Sample place F', category_name: 'Attraction', category_icon: '🏛️' },
    { id: 8869, name: 'Sample place G', category_name: 'Hotel', category_icon: '🏨' },
    { id: 8877, name: 'Sample transfer', category_name: 'Transport', category_icon: '🚌', address: 'Sample route' },
  ],
  assignments: {
    1237: [
      { place: { id: 8872, name: 'Sample place C', category_name: 'Restaurant' } },
      { place: { id: 8876, name: 'Sample place E', category_name: 'Store' } },
    ],
  },
};

const bindings = [
  { id: 's1', thingId: 8872, thingName: 'Sample place C', publicUrl: '/ts-thing-media/sample-trip/venue-c-plates-photo.jpg', mimeType: 'image/jpeg', mediaKind: 'photo' },
  { id: 's2', thingId: 8871, thingName: 'Sample place F', publicUrl: '/ts-thing-media/sample-trip/venue-f-photo.jpg', mimeType: 'image/jpeg', mediaKind: 'photo' },
  { id: 's3', thingId: 8869, thingName: 'Sample place B', publicUrl: '/ts-thing-media/sample-trip/venue-b-clip', mimeType: 'application/octet-stream', mediaKind: 'video', originalName: 'venue-b-video.mp4' },
  {
    id: '6ba36f2a-e9f2-467e-9e61-3aac64fe165a',
    thingId: 8869,
    thingName: 'Sample place B',
    publicUrl: 'https://v3b2c4d5.public.blob.vercel-storage.com/thing-media/sample-trip/6ba36f2a-e9f2-467e-9e61-3aac64fe165a',
    mimeType: 'application/octet-stream',
    mediaKind: 'photo',
    originalName: 'venue-b-video.mp4',
  },
];

assert.equal(isBoundStoryMediaUrl('/api/bind-thing-media?shareToken=x&id=1&raw=1'), true);
assert.equal(captureThingLogo(shared.places[0], {}), '');
assert.equal(thingCreateLogoFields('Sample place', 'restaurant').logoUrl, '');
assert.equal(thingCreateLogoFields('Sample place', 'restaurant').icon, '🍽️');
assert.equal(thingCreateLogoFields('Sample route', 'flight').isFlight, true);
assert.equal(sourceLogoUrl({ name: 'Sample place', source: { logo: 'https://cdn.example/mark.svg' } }), 'https://cdn.example/mark.svg');
assert.equal(sourceLogoUrl({ website: 'https://cafe.example/menu' }), 'https://cafe.example/favicon.ico');
assert.equal(sourceLogoUrl({ name: 'Sample place J' }), '');

const logos = applyCapturedLogos(shared);
assert.equal(logos.thingOverrides['place:8872'].logoUrl, '');
assert.equal(logos.thingOverrides['place:8872'].icon, '🍽️');
assert.ok(!isAirplaneGlyph(logos.thingOverrides['place:8876'].icon));
assert.equal(timelineIcon(shared.places[3], shared.thingOverrides['place:8871']).isFlight, false);
assert.equal(captureThingLogo({ name: 'Sample Place' }, {}), '');
const sampleShared = {
  trip: { id: 1, title: 'Sample Trip', description: 'A sample trip.' },
  days: [],
  places: [{ id: 1, name: 'Sample Place' }],
  assignments: {},
};
const sampleHtml = renderStyle2Html(sampleShared, [], { origin: 'https://example.test', shareToken: 'sample' });
assert.match(sampleHtml, /data-thing-id="1"[^>]*>\s*<span class="thing-emoji">/);
assert.match(sampleHtml, /<p class="muted">sample<\/p>/);
const datedHtml = renderStyle2Html({
  ...sampleShared,
  trip: { ...sampleShared.trip, start_date: '1 Mar', end_date: '4 Mar' },
}, [], { origin: 'https://example.test', shareToken: 'sample' });
assert.match(datedHtml, /<p class="muted">1 Mar – 4 Mar · sample<\/p>/);
const missingTitle = renderStyle2Html({
  trip: { id: 1 },
  days: [],
  places: [],
  assignments: {},
}, [], { shareToken: 'sample' });
assert.doesNotMatch(missingTitle, /<h1[\s>]/);
assert.match(missingTitle, /<p class="muted">sample<\/p>/);
assert.match(missingTitle, /<title><\/title>/);
const missingToken = renderStyle2Html({
  trip: { id: 1, title: 'Sample Trip' },
  days: [],
  places: [],
  assignments: {},
}, [], {});
const missingTokenPage = missingToken.match(/data-page="1"[\s\S]*?<\/section>/)[0];
assert.match(missingTokenPage, /<h1>Sample Trip<\/h1>/);
assert.equal((missingTokenPage.match(/<p class="muted">/g) || []).length, 1);
assert.match(missingTokenPage, /<p class="muted">Trip summary<\/p>/);
assert.match(missingToken, /<title>Sample Trip · Style 2<\/title>/);
const dateOnly = renderStyle2Html({
  trip: { id: 1, title: 'Sample Trip', start_date: '1 Mar', end_date: '4 Mar' },
  days: [],
  places: [],
  assignments: {},
}, [], {});
assert.match(dateOnly, /<p class="muted">1 Mar – 4 Mar<\/p>/);
assert.doesNotMatch(dateOnly, /<p class="muted">1 Mar – 4 Mar ·/);
assert.doesNotMatch(sampleHtml, /data-thing-id="1"[^>]*>\s*<img/);
const sourcedHtml = renderStyle2Html({
  ...sampleShared,
  places: [{ id: 2, name: 'Sample Place', source: { logo: 'https://cdn.example/mark.svg' } }],
}, [], { origin: 'https://example.test', shareToken: 'sample' });
assert.match(sourcedHtml, /https:\/\/cdn\.example\/mark\.svg/);

const paddedLogos = applyCapturedLogos(shared);
for (const place of paddedLogos.places) {
  const logo = paddedLogos.thingOverrides[`place:${place.id}`]?.logoUrl || '';
  assert.equal(logo, '', `padded ${place.name} has no name-mapped logo`);
}

const summary = realTripSummary(shared);
assert.equal(BOILERPLATE_RE.test(summary), false);
assert.match(summary, /Notes from the trip record/);

const html = renderStyle2Html(shared, bindings, {
  origin: 'https://vacation-staging.timesyncher.com',
  shareToken: 'sample-trip',
});

assert.match(html, /data-style="2"/);
assert.match(html, /data-sole-layout="1"/);
assert.match(html, new RegExp(`data-product-sot="${PRODUCT_SOT_SLUG}"`));
assert.match(html, new RegExp(`data-product-sot-alias="${PRODUCT_SOT_ALIAS}"`));
assert.match(html, new RegExp(`data-product-receipt="${PRODUCT_SOT_RECEIPT}"`));
assert.equal(PRODUCT_SOT_SLUG, 'bot-admin/messages/time-syncher/style-2-journey-book-standard');
assert.equal(PRODUCT_SOT_ALIAS, PRODUCT_SOT_SLUG);
assert.equal(PRODUCT_SOT_TWIN, 'bot-admin/messages/time-syncher/style-2-journey-book-product-standard-20260910');
assert.equal(PRODUCT_SOT, PRODUCT_SOT_SLUG);
assert.equal(HANDLER_SOT_TWIN, PRODUCT_SOT_TWIN);
assert.equal(PRODUCT_SOT_RECEIPT, 'bot-admin/receipts/cos-style-2-journey-book-product-standard-20260910');
assert.match(html, /data-page="1"/);
assert.match(html, /data-trip-directory="1"/);
assert.match(html, /data-stories-up-front="1"/);
assert.match(html, /data-post-itinerary="1"/);
assert.match(html, /class="daily-grid"/);
assert.match(html, /class="timeline-rail"/);
assert.match(html, /data-maps="omitted"/);
assert.match(html, /data-min-things="8"/);
assert.match(html, /Notes from the trip record/);
assert.match(html, /Spicy rigatoni/);
assert.match(html, /wet petals/);
assert.doesNotMatch(html, /\.svg"/);
assert.doesNotMatch(html, /brought together your day-by-day plan/);
assert.match(html, /data-icon-type="restaurant"/);
assert.match(html, /data-icon-type="store"/);
assert.match(html, /data-thing-id="8877" data-icon-type="transport"/);
assert.doesNotMatch(html, /data-icon-type="flight"/);

const page1 = html.match(/data-page="1"[\s\S]*?<\/section>/)[0];
assert.match(page1, /data-trip-directory="1"/);
assert.match(page1, /Sample place C/);
assert.match(page1, /Sample place E/);
assert.doesNotMatch(page1, /\.svg"/);

const storiesIdx = html.indexOf('data-stories-up-front="1"');
const daysIdx = html.indexOf('data-print-ready="daily"');
const listsIdx = html.indexOf('data-post-itinerary="1"');
assert.ok(storiesIdx > 0 && daysIdx > storiesIdx, 'stories before itinerary');
assert.ok(listsIdx > daysIdx, 'thing lists after itinerary');

const airplaneOnNonFlight = [...html.matchAll(/data-icon-type="(?!flight)[^"]+">\s*(?:<span class="thing-emoji">)?(?:✈️|&#9992;)/g)];
assert.equal(airplaneOnNonFlight.length, 0, 'no airplane on non-flight rows');
assert.match(html, /data-story-card="1"/);
assert.match(html, /data-story-media-only="1"/);
assert.match(html, /data-video-qr="1"/);
assert.doesNotMatch(html, /venue-b-video\.mp4/);
assert.doesNotMatch(html, /<video /);
const hotelCard = html.match(/<article class="story-card"[^>]*data-thing-id="8869"[\s\S]*?<\/article>/)[0];
assert.match(hotelCard, /data-icon-type="hotel"/);
assert.doesNotMatch(hotelCard, /✈️/);
assert.doesNotMatch(hotelCard, /tiny-logo|thing-emoji|\.svg"/);
assert.doesNotMatch(hotelCard, /data-cover-kind="photo"/);
assert.doesNotMatch(hotelCard, /<img[^>]+6ba36f2a/);
assert.match(hotelCard, /data-video-qr="1"/);
const attractionCard = html.match(/<article class="story-card"[^>]*data-thing-id="8871"[\s\S]*?<\/article>/)[0];
assert.match(attractionCard, /data-icon-type="attraction"/);
assert.doesNotMatch(attractionCard, /✈️/);
assert.doesNotMatch(attractionCard, /tiny-logo|thing-emoji/);
assert.match(attractionCard, /venue-f-photo\.jpg/);
assert.match(html, /data-row-thumb="1"/);
const videoCover = pickStoryCover([
  { publicUrl: '/x.mp4', mimeType: 'video/mp4', mediaKind: 'video', originalName: 'night-video.mp4' },
], 'https://cdn.example/mark.svg');
assert.equal(videoCover.kind, 'video');
assert.equal(pickStoryCover([], '').kind, 'none');
const mislabeledNightVideo = pickStoryCover([
  {
    publicUrl: 'https://example.test/api/bind-thing-media?shareToken=sample&id=1&raw=1',
    mimeType: 'application/octet-stream',
    mediaKind: 'photo',
    originalName: 'night-video.mp4',
  },
], 'https://cdn.example/mark.svg');
assert.equal(mislabeledNightVideo.kind, 'video');

const model = buildStyle2Model(shared, bindings, 'https://vacation-staging.timesyncher.com');
assert.equal(model.airplaneAudit.length, 0);
assert.ok(model.stories.length >= 3);
assert.equal(model.isBoilerplate, false);
assert.equal(itineraryMinThings({}), 8);
assert.ok(model.assignedCount >= Math.min(model.placeCount, model.minThings));
const filled = backfillAssignments(shared, { TIMESYNCHER_ITINERARY_MIN_THINGS: '8' });
assert.equal(filled.shortfall, 2);
const playbackUrl = 'https://v3b2c4d5.public.blob.vercel-storage.com/thing-media/sample-trip/6ba36f2a-e9f2-467e-9e61-3aac64fe165a';
const playbackQr = qrSvg(playbackUrl, { size: PDF_QR_SIZE });
assert.match(playbackQr, /<svg[\s\S]*<rect/);
assert.match(playbackQr, /fill="#fff"/);
const darkRects = playbackQr.match(/<rect[^>]*fill="#000"/g) || [];
assert.ok(darkRects.length >= 200, 'QR matrix has dark modules');
assert.equal(darkRects.length, qrModules(playbackUrl).flat().filter(Boolean).length);
assert.equal(allowedQrPayload(playbackUrl), true);
assert.equal(allowedQrPayload('javascript:alert(1)'), false);
const qrRes = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; }, end(body) { this.body = body || ''; } };
handlePdfQrSvg({ url: `/api/pdf/qr.svg?data=${encodeURIComponent(playbackUrl)}` }, qrRes);
assert.equal(qrRes.statusCode, 200);
assert.match(qrRes.headers['content-type'], /image\/svg\+xml/);
assert.equal(qrRes.body, playbackQr);
assert.doesNotMatch(qrRes.body, /camera|placeholder|NOT_FOUND/i);

assert.equal(isKeepsakeJunkMedia({
  filename: 'venue-c-neon-bind-proof.png',
  caption: 'Neon file bind proof',
  url: 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=x&id=c67aeea4&raw=1',
}), true);
assert.equal(isKeepsakeJunkMedia({
  originalName: 'venue-c-bind-proof.png',
  caption: 'Sample place C',
  publicUrl: 'https://travel.timesyncher.com/ts-thing-media/sample-trip/venue-c-bind-proof.png',
}), true);
assert.equal(isKeepsakeJunkMedia({
  filename: 'venue-c-plates-photo.jpg',
  caption: 'Sample place C',
  url: 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=x&id=bb277e4a&raw=1',
}), false);
const stripped = stripKeepsakeJunkMedia({
  media: [
    { filename: 'venue-c-plates-photo.jpg', caption: 'Sample place C', url: '/plates.jpg' },
    { filename: 'venue-c-hands-photo.jpg', caption: 'Sample place C', url: '/hands.jpg' },
    { filename: 'venue-c-neon-bind-proof.png', caption: 'Neon file bind proof', url: '/neon.png' },
    { filename: 'venue-c-bind-proof.png', caption: 'Sample place C', url: 'https://travel.timesyncher.com/ts-thing-media/sample-trip/venue-c-bind-proof.png' },
  ],
  places: [{
    id: 8872,
    name: 'Sample place C',
    image_url: '/plates.jpg',
    bound_media: [
      { originalName: 'venue-c-plates-photo.jpg', publicUrl: '/plates.jpg', mimeType: 'image/jpeg' },
      { originalName: 'venue-c-neon-bind-proof.png', caption: 'Neon file bind proof', publicUrl: '/neon.png' },
    ],
  }],
});
assert.equal(stripped.media.length, 2);
assert.ok(stripped.media.every((item) => /plates|hands/.test(item.filename)));
assert.equal(stripped.places[0].bound_media.length, 1);
assert.doesNotMatch(JSON.stringify(stripped), /Neon file bind proof|bind-proof/i);

const samplePhotoUrl = '/ts-thing-media/sample-trip/venue-c-plates-photo.jpg';
const sampleStubUrl = '/ts-thing-media/sample-trip/venue-c-bind-proof.png';
const samplePhotoDisk = publicMediaDiskPath(samplePhotoUrl);
const sampleStubDisk = publicMediaDiskPath(sampleStubUrl);
await mkdir(dirname(samplePhotoDisk), { recursive: true });
const samplePhoto = Buffer.alloc(36 * 1024, 0x11);
samplePhoto[0] = 0xff;
samplePhoto[1] = 0xd8;
await writeFile(samplePhotoDisk, samplePhoto);
await writeFile(sampleStubDisk, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
try {
  const mergedMedia = mergeBindingsIntoShared({
    places: [{ id: 8872, name: 'Sample place C' }, { id: 8869, name: 'Sample place B' }],
    media: [],
  }, [
    { thingId: 8872, originalName: 'venue-c-plates-photo.jpg', publicUrl: samplePhotoUrl, mimeType: 'image/jpeg', mediaKind: 'photo' },
    { thingId: 8869, originalName: 'venue-b-video.mp4', publicUrl: '/ts-thing-media/sample-trip/venue-b-video.mp4', mimeType: 'video/mp4', mediaKind: 'video' },
  ]);
  assert.equal(mergedMedia.media.length, 2);
  assert.equal(mergedMedia.places[0].photos.length, 1);
  assert.equal(mergedMedia.places[0].photos[0].publicUrl, samplePhotoUrl);
  assert.match(mergedMedia.places[0].photos[0].printDataUrl, /^data:image\/jpeg;base64,/);
  assert.ok(mergedMedia.places[0].photos[0].printDataUrl.length > 40_000, 'printDataUrl must be real photo bytes, not a 3071B stub');
  assert.match(mergedMedia.places[0].photos[0].url, /^data:image\/jpeg;base64,/);
  assert.equal(mergedMedia.places[1].videos.length, 1);
  assert.match(mergedMedia.places[1].videos[0].url, /venue-b-video\.mp4/);
  assert.equal(mergedMedia.places[1].videos[0].printDataUrl, undefined);

  const platesData = printDataUrlForPublicFile(samplePhotoUrl, 'image/jpeg');
  assert.match(platesData, /^data:image\/jpeg;base64,/);
  assert.ok(Buffer.from(platesData.split(',')[1], 'base64').length > PRINT_STUB_MAX_BYTES);
  assert.equal(printDataUrlForPublicFile(sampleStubUrl, 'image/png'), '');
  const platesBytes = await readFile(samplePhotoDisk);
  assert.ok(platesBytes.length > PRINT_STUB_MAX_BYTES, 'sample photo must not be a color-card stub');
  assert.notEqual(platesBytes.length, 3071, 'sample photo must not be a TREK 1024 canvas');
  assert.equal(platesBytes[0], 0xff);
  assert.equal(platesBytes[1], 0xd8);
} finally {
  await rm(samplePhotoDisk, { force: true });
  await rm(sampleStubDisk, { force: true });
}

const overlay = await readFile(new URL('../public/ts-thing-media-overlay.js', import.meta.url), 'utf8');
assert.doesNotMatch(overlay, /wantsJourneyBook/);
assert.doesNotMatch(overlay, /document\.write/);
assert.doesNotMatch(overlay, /ts-journey-chip/);
assert.doesNotMatch(overlay, /report\/style-2/);
const patch = await readFile(new URL('../public/ts-timeline-icon-patch.js', import.meta.url), 'utf8');
assert.match(patch, /isTinyIconSlot/);
assert.match(patch, /rect\.width > 48/);
assert.match(patch, /placeItems = 'center'/);
assert.match(patch, /maxWidth = '100%'/);
assert.match(patch, /AIRPLANE/);
assert.match(patch, /printMode/);
assert.match(patch, /isPrintReport/);
assert.match(patch, /\\\/journey\\\/\?\$/);
assert.match(patch, /print-media-qr/);
assert.match(patch, /data:image\/svg\+xml/);
assert.match(patch, /neon file bind proof/);
assert.match(patch, /data-stories-two-col/);
assert.match(patch, /grid-template-columns:1fr 1fr/);
assert.match(patch, /break-inside:avoid/);
assert.match(patch, /injectStoriesPrintCss/);
assert.match(patch, /style2-day-opening/);
assert.match(patch, /style2-timeline/);
assert.match(patch, /flex-direction:column/);
assert.match(patch, /print-media-card/);
assert.match(patch, /padding:18mm 9mm 12mm 9mm/);
assert.match(patch, /data-end-continuous/);
assert.match(patch, /report-section>h2\{break-after:avoid/);
assert.match(patch, /object-fit:contain/);
assert.match(patch, /data-day-things-flow/);
assert.match(patch, /data-last-page-logo/);
assert.match(patch, /\[data-last-page-logo="1"\]\{display:flex!important;flex-direction:row/);
assert.doesNotMatch(patch, /\[data-last-page-logo="1"\]\{display:flex!important;flex-direction:column/);
assert.match(patch, /data-last-content-page/);
assert.doesNotMatch(patch, /data-last-logo-page/);
assert.match(patch, /data-print-chrome-header/);
assert.match(patch, /@bottom-center/);
assert.match(patch, /counter\(page\)/);
assert.match(patch, /margin-top:0/);
assert.match(patch, /style2-thing-meta\{position:static/);
assert.match(patch, /data-endlist-maps/);
assert.match(patch, /data-day-map-page/);
assert.match(patch, /data-stories-packed/);
assert.match(patch, /keepsake-day:last-child \.daily-page/);
assert.doesNotMatch(patch, /\[data-end-continuous="1"\] \.report-section\{break-inside:avoid/);
assert.doesNotMatch(patch, /display:table!important/);
assert.doesNotMatch(patch, /daily-left.*38%/);
assert.match(patch, /serviceWorker/);
assert.match(patch, /unregister/);
assert.doesNotMatch(patch, /fillTrip/);
assert.doesNotMatch(patch, /XMLHttpRequest\.prototype/);
assert.doesNotMatch(patch, /journey\?style=2/);
assert.doesNotMatch(patch, /patchedOpen/);

const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
assert.match(vercel, /keepsakePdf/);
assert.match(vercel, /pdfQr/);
assert.match(vercel, /\/api\/pdf\/qr\\\\.svg/);
assert.match(vercel, /\/api\/pdf\/shared/);
assert.match(vercel, /\/shared\/\(\[\^\/\]\+\)\/journey\(\?:\/\)\?/);
assert.match(vercel, /"dest": "\/shared-app.html"/);
assert.doesNotMatch(vercel, /report=journey/);
assert.doesNotMatch(vercel, /\/assets\/index-BKun7ofk\.js/);
assert.doesNotMatch(vercel, /\/assets\/index-CbEHlMj6\.css/);
assert.match(vercel, /\/api\/\(\.\*\)/);
assert.match(vercel, /\/report\/\(\[\^\/\?\]\+\)/);
const itinerarySrc = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(itinerarySrc, /trekBundle/);
const assetWriter = await readFile(new URL('../scripts/write-shared-assets.mjs', import.meta.url), 'utf8');
assert.match(assetWriter, /patchStyleTwoToConfigRenderer/);
assert.match(assetWriter, /index-BKun7ofk\.js/);
assert.match(assetWriter, /index-CbEHlMj6\.css/);
const viteConfig = await readFile(new URL('../vite.config.mjs', import.meta.url), 'utf8');
assert.match(viteConfig, /writeSharedAssets/);
assert.match(itinerarySrc, /pdfQr/);
assert.match(itinerarySrc, /handlePdfQrSvg/);

assert.equal(normalizeReportName('style-2'), PRODUCT_STYLE_TWO_REPORT);
assert.equal(normalizeReportName(''), PRODUCT_STYLE_TWO_REPORT);
assert.equal(normalizeReportName('keepsake-style-2.pdf'), PRODUCT_STYLE_TWO_REPORT);
assert.equal(normalizeReportName('restaurants'), 'restaurants');
assert.equal(isProductStyleTwo('style-2'), true);
assert.equal(isProductStyleTwo('keepsake-style-2'), true);
assert.equal(isProductStyleTwo('restaurants'), false);
assert.equal(isJourneyBookReport('style-2'), true);
assert.equal(isJourneyBookReport('restaurants'), false);
assert.equal(journeyBookGate({ report: 'daily' }).ok, true);
assert.equal(journeyBookGate({ report: 'keepsake-style-2' }).kind, 'style-two');
assert.equal(journeyBookGate({ report: 'restaurants' }).kind, 'trek-report');

assert.equal(wantsStyleTwoView({ report: 'journey' }), true);
assert.equal(wantsStyleTwoView({ report: 'style-2' }), false);
assert.equal(
  productStyleTwoViewUrl({ shareToken: 'sample-trip' }),
  'https://vacation-staging.timesyncher.com/shared/sample-trip/journey?style=2&printMode=report&pdfReport=keepsake-style-2',
);
assert.equal(
  productStyleOneViewUrl({ shareToken: 'sample-trip' }),
  'https://vacation-staging.timesyncher.com/shared/sample-trip/journey?style=1&printMode=report&pdfReport=keepsake',
);
assert.equal(isProductStyleOne('keepsake'), true);
assert.equal(isProductStyleOne('keepsake-style-2'), false);
assert.equal(PRODUCT_STYLE_ONE_REPORT, 'keepsake');
const styleTwoUrl = productPdfUrl({
  shareToken: 'sample-trip',
  report: 'style-2',
  origin: 'https://vacation-staging.timesyncher.com',
});
assert.equal(
  styleTwoUrl,
  'https://vacation-staging.timesyncher.com/shared/sample-trip/journey?style=2&printMode=report&pdfReport=keepsake-style-2',
);
assert.doesNotMatch(styleTwoUrl, /travel\.timesyncher\.com/);
assert.equal(
  styleTwoLocationStaysOnStaging(styleTwoUrl, 'https://vacation-staging.timesyncher.com'),
  true,
);
assert.equal(
  styleOneLocationStaysOnStaging(
    productStyleOneViewUrl({ shareToken: 'sample-trip' }),
    'https://vacation-staging.timesyncher.com',
  ),
  true,
);
assert.equal(
  styleTwoLocationStaysOnStaging(
    'https://travel.timesyncher.com/api/pdf/shared/sample-trip/report/keepsake.pdf',
    'https://vacation-staging.timesyncher.com',
  ),
  false,
);

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (key, value) => {
    res.headers[String(key).toLowerCase()] = value;
  };
  res.end = (body) => {
    res.body = body || '';
  };
  return res;
}

for (const url of [
  '/api/vacation-itinerary?keepsakePdf=1&pdfPath=sample-trip/report/style-2',
  '/api/vacation-itinerary?keepsakePdf=1&pdfPath=sample-trip/report/keepsake-style-2.pdf',
  '/api/vacation-itinerary?keepsakePdf=1&shareToken=sample-trip&report=style-2',
]) {
  const res = mockRes();
  await keepsakeStyle2Handler({
    url,
    headers: {
      host: 'vacation-staging.timesyncher.com',
      'x-forwarded-proto': 'https',
    },
  }, res);
  assert.equal(res.statusCode, 302, url);
  assert.equal(res.headers['x-timesyncher-style2'], 'staging-ae', url);
  assert.match(res.headers.location, /vacation-staging\.timesyncher\.com\/shared\/sample-trip\/journey\?.*pdfReport=keepsake-style-2/);
  assert.doesNotMatch(res.headers.location, /travel\.timesyncher\.com/);
}
{
  const res = mockRes();
  await keepsakeStyle2Handler({
    url: '/api/vacation-itinerary?keepsakePdf=1&shareToken=sample-trip&report=keepsake',
    headers: {
      host: 'vacation-staging.timesyncher.com',
      'x-forwarded-proto': 'https',
    },
  }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers['x-timesyncher-style1'], 'staging-ae');
  assert.match(res.headers.location, /journey\?.*style=1.*pdfReport=keepsake/);
  assert.doesNotMatch(res.headers.location, /keepsake-style-2|travel\.timesyncher\.com/);
}
assert.equal(
  patchStyleTwoToConfigRenderer(`if(h==="report"&&g){${STYLE2_USES_ZU}}`),
  `if(h==="report"&&g){${STYLE2_USES_AE}}`,
);

const liveOverride = applyProductKeepsakeOverrides({
  places: [
    ...shared.places,
    { id: 8874, name: 'Sample place H', category_name: 'Restaurant' },
    { id: 8875, name: 'Sample place I', category_name: 'Restaurant' },
  ],
  assignments: shared.assignments,
  thingOverrides: {
    'place:8871': { title: 'Sample place A', category: 'other', story: 'wet petals' },
    'place:8872': { story: 'Spicy rigatoni' },
    'place:8869': { title: 'Sample place B', category: 'hotel' },
  },
});
assert.equal(liveOverride.thingOverrides['place:8872'].category, 'restaurant');
assert.equal(liveOverride.thingOverrides['place:8876'].category, 'store');
assert.equal(liveOverride.thingOverrides['place:8873'].category, 'restaurant');
assert.equal(liveOverride.thingOverrides['place:8869'].category, 'hotel');
assert.equal(liveOverride.thingOverrides['place:8877'].category, 'transport');
assert.notEqual(liveOverride.thingOverrides['place:8871'].category, 'restaurant');
assert.notEqual(liveOverride.thingOverrides['place:8871'].category, 'store');
assert.equal(liveOverride.thingOverrides['place:8872'].lat, undefined);
assert.equal(liveOverride.thingOverrides['place:8876'].lng, undefined);
assert.equal(liveOverride.places.find((place) => String(place.id) === '8872').category.name, 'Restaurant');
const restaurantAssign = (liveOverride.assignments?.['1237'] || []).find((row) => Number(row.place?.id) === 8872);
assert.equal(restaurantAssign.place.lat, undefined);
assert.equal(restaurantAssign.place.lng, undefined);
assert.equal(liveOverride.thingOverrides['place:8872'].timeline, true);
assert.equal(liveOverride.thingOverrides['place:8872'].summary, undefined);
assert.equal(liveOverride.thingOverrides['place:8872'].happyHour, undefined);
assert.equal(liveOverride.thingOverrides['place:8872'].happyHourDetails, undefined);
assert.equal(liveOverride.thingOverrides['place:8873'].summary, undefined);
assert.equal(liveOverride.thingOverrides['place:8874'].summary, undefined);
assert.equal(liveOverride.thingOverrides['place:8871'].summary, undefined);
assert.equal(resolveThingCoords({ name: 'Sample Venue', address: 'Sample City' }), null);
assert.equal(resolveThingCoords({ name: 'Sample Cafe', address: 'Sample Road' }), null);
assert.deepEqual(resolveThingCoords({
  name: 'Sample Venue',
  source: { lat: 10, lng: 20, neighborhood: 'Sample Area' },
}), [10, 20]);
assert.equal(liveOverride.thingOverrides['place:8873'].lat, undefined);
const buckets = keepsakeListBuckets(liveOverride);
assert.ok(buckets.Restaurants.some((row) => row.place.name.includes('Sample place C')));
assert.ok(buckets.Stores.some((row) => row.place.name.includes('Sample place E')));
assert.ok(!buckets['Shows, Tours and the Rest'].some((row) => row.place.name === 'Sample place C' || row.place.name === 'Sample place E'));
assert.ok(buckets.Hotels.some((row) => String(row.place.id) === '8869'));

const aeFixture = [
  STYLE2_USES_ZU,
  'const zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story)),ua=G.map(([nr,Oo])=>`<div class="summary-stat"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(""),Rn=(nr,Oo,_i=!1)=>`<section class="report-section"><h2>${an(nr)}${_i?" (continued)":""}</h2><ul class="logo-list">${Oo.map(w).join("")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=35,zr=42,Mo=()=>{Pn.push(Zn.join("")),Zn=[],sr=0};G.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const[Is,...Hl]=Pn,pc=Pr.summary?`<p class="muted">Trip summary</p><div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join("")}</div>`:"",gr=Pr.eventSummary?`<p class="keepsake-summary">You experienced ${Re.size} ${Re.size===1?"event":"events"} this vacation.</p>`:"",js=Pr.stories&&zt.length?`<section class="page keepsake-report keepsake-list-page">${Wi}<h2>Saved stories</h2><div class="recap-grid">${zt.map(fs).join("")}</div></section>`:"",zl=Qa.map(nr=>`<div class="keepsake-day">${op(nr,{includeMap:so(nr),brandHtml:Wi})}</div>`).join(""),wn=`<section class="page keepsake-report">${Wi}<h1>${an(la.title||"Vacation")}</h1>${pc}${gr}<div class="summary-grid">${ua}</div>${Is}</section>`,Qi=Hl.map(nr=>`<section class="page keepsake-report keepsake-list-page">${Wi}${nr}</section>`).join("");return`${wn}${Qi}${js}${zl}`}',
  'Hc=G=>`/api/pdf/qr.svg?data=${encodeURIComponent(So(G))}`',
  'zr=fo(zt).length?`<div class="style2-thing-media">${fo(zt).map(Ba).join("")}</div>`:""',
  'w=G=>{const Re=_l(G);return`<li>${Re?`<img class="tiny-logo" src="${an(Re)}" />`:`<span class="thing-emoji" style="width:22px;height:22px;font-size:13px">${an(Pc(G))}</span>`}<span>${an(Bs(mr(G)))}</span></li>`}',
  'const di=`<div class="timeline-title">${an(Bs(_i.title))}</div>`',
  '<div class="timeline-title">${an(Bs(Zn.title))}</div>',
  'Ki&&(()=>{const G=Ki,Re=Ci(G),zt=li(G);return n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:14,overflow:"hidden",border:"1px solid var(--border-faint, #e5e7eb)"},children:[',
  'onMouseLeave:Hl,style:{position:"relative",width:zt?42:58,minWidth:zt?42:58}',
  'js&&n.jsxs("div",{style:{position:"absolute",zIndex:9e3,left:zt?-8:0,bottom:zt?48:66,width:248,background:"white",border:"1px solid #d1d5db",borderRadius:14,boxShadow:"0 18px 45px rgba(15,23,42,0.22)",padding:10},children:[',
  '${Rn}${Pn?`<div class="reviews">${Pn}</div>`:""}</article>`},ws=',
  ',[/guided walking|audio history/i,[1.5,2.5]]]',
  'Mn=G=>{const Re=String(G||"").toLowerCase();return Re.includes("flight")?"flight":Re.includes("car")||Re.includes("rental")?"car":Re.includes("hotel")?"hotel":',
  '$n=gt.filter(G=>Fs.some(Re=>vn(Re).includes(G))),Gn=Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re))),ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G))),Qn=Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re))),ki=Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G)))',
  'Os.map(G=>n.jsx("button",{onClick:()=>Kn(G)',
  '_l=G=>{if(qr(G))return pDe;const Re=ha(G);return Re.logoUrl||Re.iconUrl||G.logoUrl||oi(cc(G))}',
  'It=G=>Mn(ha(G).category??Fn(G))',
  'Qn.map(G=>Oe(G)),Qn.length===0',
  'Gn.map(G=>Oe(G)),Gn.length===0',
  'ki.map(G=>Oe(G))',
  'Mo=Array.from(new Map(Qa.flatMap(di=>Ci(di)).filter(di=>(di==null?void 0:di.item)&&!["travel","travel-to-thing","transport","hotel-wake","hotel-sleep","hotel-checkout"].includes(di.type)).map(di=>{const Xi=di.item;return[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}]})).values())',
  'height:dn?900:300,marginBottom:12',
  'ha=G=>le[Qt(G)]||{},Sn=',
  'getSharedTrip:e=>Rt.get(`/shared/${e}`,{params:{_ts:Date.now()},headers:{"Cache-Control":"no-cache"}}).then(t=>t.data)',
  'lf.getSharedTrip(r).then(G=>{A(G),G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object"?pe(G.thingOverrides):pe({}),me(!0),ge(!1)})',
  'checked:!!ha(Dt).happyHour,onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"',
  'value:ha(Dt).happyHourDetails??"",onChange:G=>Xa(Dt,"happyHourDetails",G.target.value)',
  'Co=G=>ha(G).longDetails??Fl(G)',
  'ua=zi(G)?ha(G).happyHourDetails:""',
  'Zn=zi(zt)?ha(zt).happyHourDetails:""',
  'h=c.get("printMode")||(i.includes("printMode=daily")?"daily":null)',
  'g=c.get("pdfReport")||((Bl=i.match(/[?&]pdfReport=([^&]+)/))==null?void 0:Bl[1])||null',
  'n.jsx(tc,{path:"/shared/:token",element:n.jsx(wse,{})})',
  'function _se({title:e,html:t,styles:i}){return I.useEffect(()=>{const c=()=>{const h=Array.from(document.querySelectorAll(".page")),p=h.length,g=!!document.querySelector(".print-brand");h.forEach((r,x)=>{if(!r.querySelector(".pdf-page-counter")){const z=document.createElement("div");z.className="pdf-page-counter",z.textContent=`Page ${x+1} of ${p}`,r.appendChild(z)}if(x===p-1&&g&&!r.querySelector(".pdf-final-logo")){const z=document.createElement("img");z.className="pdf-final-logo",z.src="/icons/timesyncher-icon-black-transparent.png",z.alt="TimeSyncher",r.appendChild(z)}})};document.open(),document.write(`<!doctype html><html><head><title>${e.replace(/[&<>\\"]/g,"")}</title>${i}</head><body>${t}<script>(${c.toString()})();<\\/script></body></html>`),document.close()},[e,t,i]),n.jsx("div",{style:{padding:20,fontFamily:"system-ui, sans-serif"},children:"Preparing PDF…"})}',
  'Ds=G=>{var Re;return Mi(G)?!1:((Re=le[Qt(G)])==null?void 0:Re.timeline)??hl(G)}',
  '<div class="daily-grid">${js}<main class="daily-details">',
  'js=`<aside class="daily-left">',
  'return`<article class="thing daily-thing"><div class="thing-head">',
  'Ae=()=>{const G=de(!0).filter(([,nr])=>nr.length)',
  'Rn=Ln.filter(Zn=>ua.includes(Number(Zn.place_id??Zn.placeId)));return Fo([...Rn,...Hs(G),...Hs(ha(G))].map((Zn,sr)=>rp(Zn,sr,Re,zt)).filter(Boolean))}',
  'nd=G=>Fo(li(G))',
  'So=G=>{const Re=String(G||"").trim();if(!Re)return"";try{const zt="https://travel.timesyncher.com",ua=new URL(Re,zt);return["192.168.1.15:3010","100.66.47.62:3010","localhost:3010","127.0.0.1:3010"].includes(ua.host)?`${zt}${ua.pathname}${ua.search}${ua.hash}`:ua.toString()}catch{return Re}}',
  '`<figure class="print-media-card"><img src="${an(So(G.thumbnailUrl||G.url))}" alt="${an(Re)}" /><figcaption>${an(Re)}</figcaption></figure>`',
  'fs=G=>{const Re=_l(G),zt=[En(G),bi(G),Zr(G)].filter(Boolean).map(an).join(" · "),ua=[rr(G),Co(G),zi(G)?ha(G).happyHourDetails:"",ha(G).story].filter(Boolean).map(Rn=>`<p>${an(Rn)}</p>`).join("");return`<article class="thing"><div class="thing-head">${Re?`<img class="thing-logo" src="${an(Re)}" />`:`<span class="thing-emoji">${an(Pc(G))}</span>`}<div><h3>${an(Bs(mr(G)))}</h3>${zt?`<div class="thing-meta">${zt}</div>`:""}</div></div>${ua||`<p>${an(Fl(G))}</p>`}</article>`}',
  'Kl=G=>String((G==null?void 0:G.url)||(G==null?void 0:G.mediaUrl)||(G==null?void 0:G.fileUrl)||(G==null?void 0:G.src)||(G==null?void 0:G.href)||(G==null?void 0:G.videoUrl)||(G==null?void 0:G.photoUrl)||"").trim()',
  'Hs=G=>[..._d(G==null?void 0:G.media),..._d(G==null?void 0:G.photos)',
  '.print-media-card{margin:0;width:92px;text-align:center;break-inside:avoid}.print-media-card>img{width:92px;height:72px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;background:#f8fafc}',
  '.keepsake-list-page{break-before:page;page-break-before:always}',
  '.logo-list{columns:2;column-gap:18px;margin:0 0 16px;padding:0;list-style:none}',
  '.style2-page h1{font-size:20px;margin-bottom:10px}.style2-day-opening{text-align:center;margin:0 auto 16px;max-width:650px}',
  '.page{padding:9mm}',
  'Pn=Rn.slice(0,2),Zn=[];for(let zr=2;zr<Rn.length;zr+=3)Zn.push(Rn.slice(zr,zr+3));const sr=`<section class="page daily-page style2-page" data-print-ready="style2">${cr}<h1>${an(la.title||"Trip")}</h1>${Su(G,Re,Rn.map(zr=>zr.item))}<main class="style2-details">${Pn.map(zr=>wd(zr,G)).join("")}</main></section>`,Xr=Zn.map((zr,Mo)=>`<section class="page daily-page style2-page" data-print-ready="style2">${cr}<h1>${an(la.title||"Trip")}</h1><div class="style2-continued">Day ${an(G.day_number)} continued${G.date?` · ${an(new Date(G.date+"T00:00:00Z").toLocaleDateString(z,{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}))}`:""}</div><main class="style2-details">${zr.map(Is=>wd(Is,G)).join("")}</main></section>`).join("");return sr+Xr}',
  'zl=[];for(let _i=0;_i<Zn.length;_i+=3)zl.push(Zn.slice(_i,_i+3));zl.length||zl.push([]);const wn=Re.includeMap!==!1,Qi=zl.length+(wn?1:0),nr=zl.map((_i,Eo)=>`<section class="page daily-page" data-print-ready="daily">${zt}<h1>${an(la.title||"Trip")}</h1><div class="muted page-count">Daily printout page ${Eo+1} of ${Qi}</div><div class="daily-grid">${js}<main class="daily-details">${_i.map($r).join("")}</main></div></section>`).join(""),Oo=`<section class="page daily-page daily-map-page" data-print-ready="daily">${zt}<h1>${an(la.title||"Trip")}</h1><div class="muted page-count">Daily printout page ${Qi} of ${Qi}</div><h2>${an(G.title||`Day ${G.day_number}`)} map</h2><p class="map-caption">Actual itinerary map for Day ${an(G.day_number)}, bounded to the mapped Day-by-Day stops.</p>${pc}<div class="map-box">${Hl}</div></section>`;return nr+(wn?Oo:"")}',
  'zt=Re.brandHtml??cr',
  'Pn=ua.length?`<div class="style2-day-media">${ua.map(Ba).join("")}</div>`:""',
  '.style2-page{height:257mm;min-height:257mm;overflow:hidden}',
  'Hl=xa(Is,720,850)',
  '.daily-page{height:257mm;min-height:257mm;overflow:hidden}.daily-grid{grid-template-columns:36% minmax(0,1fr);gap:12px}.daily-left{position:static}.map-box{height:205px}.daily-details{grid-template-columns:1fr;gap:8px}',
  '.style2-thing{position:relative;margin:0 0 10px;padding:12px 124px 12px 12px}.style2-thing h3{font-size:15px}.style2-thing-meta{position:absolute;top:12px;right:12px;width:100px;text-align:right;font-size:9.5px;line-height:1.35;font-weight:900;color:#475569}',
  '.style2-thing{padding-right:118px}',
  'return`<article class="thing style2-thing"><div class="style2-thing-meta">${an(Mo)}</div><div class="thing-head">',
  'document.title=`TimeSyncher Vacation — ${P.trip.title.replace(/^TimeSyncher Vacation\\s*[—-]\\s*/i,"")}`',
  'zt=G==="keepsake"?`${la.title||"TimeSyncher Vacation"} Summary`:G==="keepsake-style-2"?`${la.title||"TimeSyncher Vacation"} Keepsake Style 2`:`TimeSyncher Vacation ${G}`',
  'cr=\'<div class="print-brand"><span>TimeSyncher</span><img class="ts-logo" src="/icons/timesyncher-icon-black-transparent.png" alt="TimeSyncher" /><span>Vacation</span></div>\',Wi=Pr.logo?cr:""',
  'zu=()=>{const G=Pr.summary?`<div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(zt=>`<p>${an(zt)}</p>`).join("")}</div>`:"";return`<section class="page keepsake-report style2-cover">${Wi}<h1>${an(la.title||"Vacation")} Keepsake</h1><p class="muted">Style two</p>${G}</section>`+Qa.map(zt=>Mc(zt)).join("")}',
  '.pdf-page-counter{position:absolute;right:9mm;bottom:5mm;font-size:8px;color:#64748b;font-weight:600}',
  '.print-brand{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px}',
  '.pdf-final-logo{position:absolute;left:50%;bottom:5mm;transform:translateX(-50%);width:24px;height:24px;object-fit:contain}',
  '@page{size:Letter;margin:0}',
  '.daily-page{break-after:page;page-break-after:always;min-height:100vh}',
  'os=(G,Re)=>String((G==null?void 0:G.thumbnailUrl)||(G==null?void 0:G.thumbnail_url)||(G==null?void 0:G.thumbUrl)||(G==null?void 0:G.posterUrl)||(G==null?void 0:G.poster_url)||(G==null?void 0:G.previewUrl)||(G==null?void 0:G.preview_url)||(G==null?void 0:G.imageUrl)||(G==null?void 0:G.image_url)||Re||"").trim()',
  'return{id:Pn,kind:ms(G),url:Rn,thumbnailUrl:os(G,Rn),caption:Zn',
  'void 0',
  '.thing{break-inside:avoid;page-break-inside:avoid;border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin:0 0 10px}',
  '.style2-details{display:grid;grid-template-columns:1fr;gap:10px}',
].join('\n');
const patchedAe = patchStyleTwoToConfigRenderer(aeFixture);
assertPatchedStyleTwo(patchedAe);
assert.match(patchedAe, /tsListThings=\(rows\)/);
assert.doesNotMatch(patchedAe, /logoUrl:tsLogo\(name\)/);
assert.match(patchedAe, /Os\.map\(G=>n\.jsx\("button",\{onClick:\(\)=>Kn\(G\)/);
assert.doesNotMatch(patchedAe, /\[\.\.\.new Set\(tsListThings\(Cc\)\.map\(Re=>Yd\(Re\)\)\.filter\(Boolean\)\)\]/);
assert.doesNotMatch(patchedAe, /const named=\(/);
assert.match(patchedAe, /data-logo-src=/);
assert.ok(patchedAe.includes('data:image\\/svg\\+xml'));
assert.doesNotMatch(patchedAe, /if\(zt\)return zt;if\(qr\(G\)\)return pDe/);
assert.ok(patchedAe.includes('ts-thing-media\\/'));
assert.doesNotMatch(patchedAe, /return named\|\|""/);
assert.match(patchedAe, /data-trip-directory="1"/);
assert.match(patchedAe, /data-directory-bucket=/);
assert.match(patchedAe, /data-post-itinerary="1"/);
assert.match(patchedAe, /data-story-media-only="1"/);
assert.match(patchedAe, /fo\(nr\)\.filter\(Km\)\.map\(Ba\)/);
assert.match(patchedAe, /neon file bind proof/);
assert.match(patchedAe, /originalName/);
assert.match(patchedAe, /\/api\/pdf\/qr\.svg\?data=\$\{encodeURIComponent\(So\(G\)\)\}&m=1/);
assertStyleTwoPatchParses();
assert.match(patchedAe, /\$\{zt\.map\(fs\)\.join\(""\)\}/);
assert.match(patchedAe, /\$\{wn\}\$\{sm\}\$\{js\}\$\{zl\}\$\{Qi\}/);
assert.doesNotMatch(patchedAe, /\$\{wn\}\$\{sm\}\$\{js\}\$\{zl\}\$\{Qi\}\$\{lg\}/);
assert.doesNotMatch(patchedAe, /\$\{wn\}\$\{Qi\}\$\{js\}\$\{zl\}/);
assert.match(patchedAe, /\$\{Mc\(nr\)\}/);
assert.match(patchedAe, /data-style2-centered-day="1"/);
assert.match(patchedAe, /flex-direction:column/);
assert.match(patchedAe, /de\(!1\)\.filter/);
assert.match(patchedAe, /_d\(G&&G\.bound_media\)/);
assert.match(patchedAe, /data-summary-src="thing"/);
assert.match(patchedAe, /print-media-card/);
assert.match(patchedAe, /data-print-ready="style2"/);
assert.match(patchedAe, /\$\{op\(nr,\{includeMap:so\(nr\),brandHtml:""\}\)\}/);
assert.match(patchedAe, /s2\?Qa\.map/);
assert.match(patchedAe, /data-end-continuous="1"/);
assert.match(patchedAe, /padding-top:18mm/);
assert.match(patchedAe, /tsMapsOn=Qa\.some\(so\)/);
assert.doesNotMatch(patchedAe, /data-category-map="1"/);
assert.doesNotMatch(patchedAe, /xa\(Oo,720,280\)/);
assert.match(patchedAe, /data-endlist-maps="0"/);
assert.match(patchedAe, /Ae\(!0\)/);
assert.match(patchedAe, /Ae=\(s2\)=>/);
assert.match(patchedAe, /padding:18mm 9mm 12mm 9mm/);
assert.match(patchedAe, /@page\{size:Letter;margin-top:0/);
assert.match(patchedAe, /data-list-summary="1"/);
assert.match(patchedAe, /data-row-summary="1"/);
assert.match(patchedAe, /data-summary-thing-only="1"/);
assert.match(patchedAe, /!\/\^\(travel\|travel-to-thing\|flight\|transport\|hotel-wake\|hotel-event\|hotel-sleep\|hotel-checkout\)\$\/i\.test\(String\(_i\.type\|\|""\)\)/);
assert.match(patchedAe, /!\/\^\(travel\|travel-to-thing\|flight\|transport\|hotel-wake\|hotel-event\|hotel-sleep\|hotel-checkout\)\$\/i\.test\(String\(Zn\.type\|\|""\)\)/);
assert.match(patchedAe, /"data-ts-pic-popup-tip":"1"/);
assert.match(patchedAe, /"data-ts-day-timeline":"1"/);
assert.match(patchedAe, /"data-ts-pic-popup":"1"/);
assert.match(patchedAe, /boxSizing:"content-box"/);
assert.doesNotMatch(patchedAe, /Ki&&\(\(\)=>\{const G=Ki,Re=Ci\(G\),zt=li\(G\);return n\.jsxs\("div",\{style:\{background:"var\(--bg-card, white\)",borderRadius:14,overflow:"hidden"/);
assert.match(patchedAe, /data-story-summary="1"/);
assert.match(patchedAe, /data-story-body="1"/);
assert.match(patchedAe, /data-daily-thing-media="1"/);
assert.match(patchedAe, /data-stories-two-col="1"/);
assert.match(patchedAe, /grid-template-columns:1fr 1fr/);
assert.match(patchedAe, /data-stories-print-css="1"/);
assert.match(patchedAe, /break-inside:avoid/);
assert.doesNotMatch(patchedAe, /data-print-fill="1"/);
assert.match(patchedAe, /data-end-two-col="1"/);
assert.match(patchedAe, /data-end-list="1"/);
assert.match(patchedAe, /style2-thing-media/);
assert.match(patchedAe, /data-print-ready="style2"/);
assert.doesNotMatch(patchedAe, /data-two-col="1"/);
assert.match(patchedAe, /\$\{Mc\(nr\)\}/);
assert.deepEqual(KEEPSAKE_LIST_MINIMUMS, {
  Restaurants: DEFAULT_FIRST_PASS_MINIMUMS.restaurant,
  Stores: DEFAULT_FIRST_PASS_MINIMUMS.store,
  'Shows, Tours and the Rest': DEFAULT_FIRST_PASS_MINIMUMS.rest,
});
const minimumsSource = await readFile(new URL('../src/vacation/keepsake-list-minimums.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(minimumsSource, /\b(?:KEEPSAKE_LIST_FILL|BIG_ISLAND_LIST_FILL|KEEPSAKE_FILL_DETAILS|BIG_ISLAND_FILL_DETAILS|LIVE_TAB_FILL|FILL_BUCKET_META|catalogForShared|padKeepsakeListNames|padLiveTabRows)\b/);
assert.match(patchedAe, /Re\.includes\("restaurant"\)\?"restaurant":Re\.includes\("hotel"\)\|\|Re\.includes\("lodging"\)\|\|Re\.includes\("accommodation"\)\|\|Re\.includes\("resort"\)\?"hotel":Re\.includes\("car"\)\|\|Re\.includes\("rental"\)\?"car"/);
assert.match(patchedAe, /tsPad=\(rows\)=>rows/);
assert.doesNotMatch(patchedAe, /__tsLiveFill:1/);
assert.match(patchedAe, /\[\]\.concat\(\(function\(\)\{const tsSeen=new Set,tsOut=\[\];for\(const Xi of \[\]\.concat\(\(Gt\|\|\[\]\)\.filter\(bn\),\(Ut\|\|\[\]\)\.filter\(bn\)\)\)/);
assert.match(patchedAe, /height:dn\?420:300,marginBottom:12/);
assert.doesNotMatch(patchedAe, /height:dn\?900:300,marginBottom:12/);
assert.match(patchedAe, /tsPad\(Qn\)\.length===0/);
assert.doesNotMatch(patchedAe, /tsFillOv=/);
assert.doesNotMatch(patchedAe, /tsPf=/);
assert.match(patchedAe, /ha=G=>le\[Qt\(G\)\]\|\|\{\}/);
assert.match(patchedAe, /getSharedTrip:e=>Rt\.get\(`\/shared\/\$\{e\}`,\{params:\{_ts:Date\.now\(\)\},headers:\{"Cache-Control":"no-cache"\}\}\)\.then\(t=>t\.data\)/);
assert.doesNotMatch(patchedAe, /G\.thingOverrides=ov;return G/);
assert.doesNotMatch(patchedAe, /tsPf\.some\(row=>row\.happyHour===true/);
assert.doesNotMatch(patchedAe, /typeof tsFillOv==="function"/);
assert.match(patchedAe, /pe\(\(G!=null&&G\.thingOverrides&&typeof G\.thingOverrides=="object"\)\?G\.thingOverrides:\{\}\)/);
assert.doesNotMatch(patchedAe, /pe\(tsMergeLe\(G\)\)/);
assert.match(patchedAe, /Re=ha\(G\)\)==null\?void 0:Re\.timeline/);
assert.match(patchedAe, /data-stories-grid="2"/);
assert.match(patchedAe, /rr\(Zn\.item\)/);
assert.doesNotMatch(patchedAe, /data-two-col-itinerary="1"/);
assert.doesNotMatch(patchedAe, /data-two-col-print="1"/);
assert.match(patchedAe, /<strong>Summary\.<\/strong>/);
assert.match(patchedAe, /<strong>Story\.<\/strong>/);
assert.match(patchedAe, /data-happy-hour=/);
assert.match(patchedAe, /longDetails/);
assert.match(patchedAe, /path:"\/shared\/:token\/journey"/);
assert.match(patchedAe, /\?"report":null\)\|\|\(i\.includes\("printMode=daily"\)/);
assert.match(patchedAe, /\?"keepsake-style-2":\(/);
assert.match(patchedAe, /\?"keepsake":null\)/);
assert.match(patchedAe, /Co=G=>ha\(G\)\.longDetails\?\?Fl\(G\)/);
assert.match(patchedAe, /ha\(G\)\.happyHour\|\|zi\(G\)/);
assert.match(patchedAe, /data-happy-hour="\$\{ha\(G\)\.happyHour\?"1":"0"\}"/);
assert.doesNotMatch(patchedAe, /ha\(nr\)\.story&&fo\(nr\)\.filter\(Km\)\.some/);
assert.match(patchedAe, /data-ae-print="1"/);
assert.match(patchedAe, /seGo=/);
assert.match(patchedAe, /location\.origin/);
assert.match(patchedAe, /So\(G\.printDataUrl\|\|G\.print_data_url\|\|G\.dataUrl\|\|G\.url\|\|G\.publicUrl\|\|G\.public_url\|\|G\.thumbnailUrl\)/);
assert.match(patchedAe, /if\(\/\^data:\|\^blob:\/i\.test\(Re\)\)return Re/);
assert.match(patchedAe, /data-saved-story-thing="1"/);
assert.match(patchedAe, /data-thing-bound-media="1"/);
assert.match(patchedAe, /data-print-media="bound"/);
assert.match(patchedAe, /data-continuous-cat="1"/);
assert.match(patchedAe, /data-cat-keep="1"/);
assert.match(patchedAe, /data-style1-continuous="1"/);
assert.match(patchedAe, /object-fit:contain/);
assert.match(patchedAe, /<base href=/);
assert.match(patchedAe, /_d\(G==null\?void 0:G\.bound_media\)/);
assert.match(patchedAe, /data-cat-keep="1"/);
assert.doesNotMatch(patchedAe, /\$\{tsMapsOn\?`<div class="map-box" data-category-map="1"/);
assert.match(patchedAe, /data-day-things-2col="1"/);
assert.match(patchedAe, /data-day-things-flow="1"/);
assert.match(patchedAe, /data-stories-packed="1"/);
assert.match(patchedAe, /data-last-page-logo="1"/);
assert.match(patchedAe, /data-hourglass-between="1"/);
assert.match(patchedAe, /data-brand-lockup="timesyncher-hourglass-vacation"/);
assert.match(patchedAe, /<span>TimeSyncher<\/span><img class="ts-logo"/);
assert.match(patchedAe, /\[data-last-page-logo="1"\]\{display:flex!important;flex-direction:row/);
assert.doesNotMatch(patchedAe, /<span>TimeSyncher Vacation<\/span>/);
assert.doesNotMatch(patchedAe, /\[data-last-page-logo="1"\]\{display:flex!important;flex-direction:column/);
assert.match(patchedAe, /data-last-content-page="1"/);
assert.doesNotMatch(patchedAe, /data-last-logo-page="1"/);
assert.doesNotMatch(patchedAe, /const lg=Wi/);
assert.doesNotMatch(patchedAe, /Daily printout page/);
assert.doesNotMatch(patchedAe, /z\.className="pdf-page-counter"/);
assert.match(patchedAe, /data-print-chrome-header="1"/);
assert.match(patchedAe, /data-summary-thing-only="1"/);
assert.match(patchedAe, /!\/\^Travel \(to\|from\)\\b\/i\.test\(String\(_i\.title\|\|""\)\)/);
assert.match(patchedAe, /@top-center/);
assert.match(patchedAe, /@bottom-center/);
assert.match(patchedAe, /counter\(page\)/);
assert.match(patchedAe, /style2-thing-meta\{position:static/);
assert.match(patchedAe, /margin-top:0/);
assert.doesNotMatch(patchedAe, /document\.title=`TimeSyncher Vacation —/);
assert.doesNotMatch(patchedAe, /\.daily-page\{height:257mm;min-height:257mm;overflow:hidden\}/);
assert.doesNotMatch(patchedAe, /\.daily-details\{grid-template-columns:1fr;gap:8px\}/);
assert.match(patchedAe, /data-thing-card="1"/);
assert.match(patchedAe, /seTitle=/);
assert.match(patchedAe, /data-logo-last-only="1"/);
assert.match(patchedAe, /\[data-day-map-page="1"\]\{break-before:page/);
assert.match(patchedAe, /\[data-endlist-maps="0"\] \.map-box/);
assert.match(patchedAe, /\[data-post-itinerary="1"\]\{break-before:page/);
assert.match(patchedAe, /data-summary-continued="1"/);
assert.match(patchedAe, /data-day-map-page="1"/);
assert.match(patchedAe, /kind!=="video"/);
assert.doesNotMatch(patchedAe, /Pn=Rn\.slice\(0,2\)/);
assert.doesNotMatch(patchedAe, /object-fit:cover/);
assert.match(patchedAe, /G\.publicUrl/);
assert.match(patchedAe, /bd\.length\?bd/);
assert.match(patchedAe, /Oo\.item&&Oo\.item\.bound_media/);
assert.match(patchedAe, /data-print-media-ready/);
assert.match(patchedAe, /b\.size===3071/);
assert.match(patchedAe, /bmp\.width===1024/);
assert.match(patchedAe, /G\.printDataUrl\)\|\|\(G==null\?void 0:G\.print_data_url\)/);
assert.doesNotMatch(patchedAe, /print-media-card>img\{width:92px;height:72px/);
assert.doesNotMatch(patchedAe, /\[data-end-continuous="1"\] \.report-section\{break-inside:avoid/);
assert.doesNotMatch(patchedAe, /const zt="https:\/\/travel\.timesyncher\.com",ua=new URL\(Re,zt\)/);
assert.match(patchedAe, /cr="",Wi=Pr\.logo\?"1":""/);
assert.doesNotMatch(patchedAe, /Wi=Pr\.logo\?cr:/);
assert.match(patchedAe, /zu=\(\)=>Ae\(!0\)/);
assert.doesNotMatch(patchedAe, /style2-cover">\$\{Wi\}/);
assert.match(patchedAe, /\.pdf-page-counter,\.page-count,\.muted\.page-count\{display:none/);
assert.doesNotMatch(patchedAe, /\.pdf-page-counter\{position:absolute;right:9mm/);
assert.match(patchedAe, /\.print-brand,\.print-brand \.ts-logo\{display:none/);
assert.doesNotMatch(patchedAe, /\.print-brand\{display:inline-flex/);
assert.match(patchedAe, /\.pdf-final-logo\{display:none/);
assert.match(patchedAe, /@bottom-center\{content:"Page " counter\(page\) " of " counter\(pages\)/);
assert.doesNotMatch(patchedAe, /@page\{size:Letter;margin:0\}/);
assert.match(patchedAe, /\[data-print-ready=style2\]\{min-height:0/);
assert.doesNotMatch(patchedAe, /\.daily-page\{break-after:page;page-break-after:always;min-height:100vh\}/);
assert.match(patchedAe, /_d\(G&&G\.item&&G\.item\.bound_media\)/);
assert.match(patchedAe, /os=\(G,Re\)=>String\(\(G==null\?void 0:G\.printDataUrl\)/);
assert.match(patchedAe, /printDataUrl:G&&\(G\.printDataUrl/);
assert.match(patchedAe, /\[data-style2-map\] \.map-box\{height:auto/);
assert.match(patchedAe, /\.daily-grid \.map-box\{height:205px\}/);
assert.match(patchedAe, /\[data-print-ready=style2\] \.style2-details/);
assert.match(patchedAe, /\[data-end-continuous\] \.map-box/);
assert.match(patchedAe, /c\.get\("style"\)==="2"\|\|c\.get\("style"\)==="style-2"\)\?"keepsake-style-2"/);
assert.doesNotMatch(patchedAe, /\.style2-details\{display:grid;grid-template-columns:1fr;gap:10px\}/);
assert.match(patchedAe, /\.style2-page \.thing,\.style2-thing/);
assert.match(patchedAe, /break-before:auto!important;break-after:auto!important;page-break-before:auto/);
assert.doesNotMatch(patchedAe, /\[data-style2-centered-day\]\{display:block!important;break-after:page/);
assert.match(patchedAe, /\[data-style2-centered-day\]\{display:block!important;break-after:auto/);
assert.doesNotMatch(patchedAe, /style="break-inside:avoid;page-break-inside:avoid;width:auto;max-width:100%"/);
assert.match(patchedAe, /style="width:auto;max-width:100%"/);
assert.doesNotMatch(patchedAe, /\.style2-page\{display:flex;flex-direction:column;align-items:center/);
assert.match(patchedAe, /\.style2-page\{display:block!important/);
assert.match(patchedAe, /\.thing\{break-inside:avoid;page-break-inside:avoid;border:1px solid #e5e7eb/);
assert.match(patchedAe, /\.style2-details\{display:grid!important;grid-template-columns:1fr 1fr!important/);
assert.doesNotMatch(patchedAe, /column-count:2/);
assert.doesNotMatch(patchedAe, /overflow-wrap:anywhere/);
assert.match(patchedAe, /overflow-wrap:break-word/);
assert.match(patchedAe, /<div class="style2-thing-meta">\$\{an\(Mo\)\}<\/div><div class="thing-head">/);
assert.doesNotMatch(patchedAe, /<div class="thing-head"><div class="style2-thing-meta">/);
assert.match(patchedAe, /grid-template-columns:32px minmax\(0,1fr\)/);
assert.doesNotMatch(patchedAe, /\.style2-details\{display:grid;grid-template-columns:1fr;gap:10px\}/);

const livePatched = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assertPatchedStyleTwo(livePatched);
assert.equal(livePatched.includes('8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y'), false);
assert.equal(livePatched.includes('children:"Trip View"'), false);
assertStyleTwoPatchParses(livePatched);
const patchedCheckPath = '/tmp/patched-style2-check.js';
await writeFile(patchedCheckPath, livePatched);
const patchedCheck = spawnSync('node', ['--check', patchedCheckPath], { encoding: 'utf8' });
assert.equal(patchedCheck.status, 0, patchedCheck.stderr || 'patched TREK bundle failed node --check');
assert.equal(
  productPdfUrl({ shareToken: 'sample-trip', report: 'restaurants' }),
  `${getProductTrekPublic()}/api/pdf/shared/sample-trip/report/restaurants.pdf`,
);
assert.equal(
  productPdfUrl({ shareToken: 'sample-trip', report: 'daily', pdfPath: 'sample-trip/daily/2.pdf' }),
  `${getProductTrekPublic()}/api/pdf/shared/sample-trip/daily/2.pdf`,
);
assert.match(
  forwardedKeepsakeSearch(new URL('https://x.test/?ksLogo=0&ksMapOff=1,2,3&other=1')),
  /^\?ksLogo=0&ksMapOff=1(?:,|%2C)2(?:,|%2C)3$/,
);
assert.doesNotMatch(
  forwardedKeepsakeSearch(new URL('https://x.test/?ksLogo=0&other=1')),
  /other=/,
);

const create = await readFile(new URL('../scripts/trek-itinerary-edit.mjs', import.meta.url), 'utf8');
assert.match(create, /captured_logo/);
assert.match(create, /image_url/);
assert.match(create, /minThings/);
assert.match(create, /Backfilled from existing trip things/);
assert.doesNotMatch(create, /airport\|[a-z]{3}\|boi/);

const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
assert.match(sharedApp, /index-BKun7ofk\.js/);
assert.match(sharedApp, /href="\/assets\/index-CbEHlMj6\.css"/);
assert.doesNotMatch(sharedApp, /crossorigin href="https:\/\/travel\.timesyncher\.com\/assets\/index-CbEHlMj6\.css"/);
assert.match(sharedApp, /__TS_JOURNEY_BOOK__ = false/);
assert.match(sharedApp, /serviceWorker/);
assert.match(sharedApp, /unregister/);
assert.match(sharedApp, /params\.set\('printMode', 'report'\)/);
assert.match(sharedApp, /pdfReport/);
assert.match(sharedApp, /keepsake-style-2/);
assert.match(sharedApp, /style === '1'/);
assert.match(sharedApp, /\\\/shared\\\/\[\^\/\]\+\\\/journey\\\/\?\$/);
assert.match(sharedApp, /x-vercel-protection-bypass/);
assert.match(sharedApp, /Pause System Mitigations/);
assert.match(sharedApp, /data-ae-print/);
assert.match(sharedApp, /Record voice note/);
assert.match(sharedApp, /\/api\/shared\/\$\{encodeURIComponent\(shareToken\)\}\/audio-note/);
assert.match(sharedApp, /data-ts-pic-popup-tip/);
assert.match(sharedApp, /leaflet-popup-tip-container/);
assert.match(sharedApp, /box-sizing: content-box !important/);

assert.match(livePatched, /i==="flight"\?"✈️"/);
assert.doesNotMatch(livePatched, /ai=Q=>gi\(Q\)\.icon\|\|Kl\(Q\)/);

console.log('keepsake style-2 tests passed');
