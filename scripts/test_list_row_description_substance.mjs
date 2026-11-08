#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  composeListRowDescription,
  pickStoredThingDescription,
} from '../src/vacation/list-row-description.mjs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { rowSummary } from '../apps/vacation-client/src/lib/listTabModel.mjs';
import { detailSummary } from '../apps/vacation-client/src/lib/detailModel.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const COMPOSED_LABEL = /\b(?:Class:|Pickup:|Drop-off:|Check-in:|Why go:|Common praise:|Location:|Set time:|Price estimate:)/i;

assert.equal(
  composeListRowDescription({
    category: 'car',
    fields: {
      description: 'Stored car description with enough words for the list row.',
      carType: 'Standard sedan',
      pickupLocation: 'JFK Airport',
    },
  }),
  'Stored car description with enough words for the list row.',
);
assert.doesNotMatch(
  composeListRowDescription({
    category: 'hotel',
    fields: {
      description: 'Hotel body copy as stored on the thing record.',
      checkInTime: '16:00',
      reviewThemes: { praise: ['helpful staff'] },
    },
  }),
  COMPOSED_LABEL,
);

const payload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const bundle = renderServedTrekBundle(raw);
assert.match(bundle, /tsListRowDescription=function\(G\)/);
assert.match(bundle, /Rn=tsListRowDescription\(G\)/);
assert.doesNotMatch(bundle, /Rn=Bs\(rr\(G\)\)/);
assert.match(
  bundle,
  /return String\(ov\.description\?\?sr\.description\?\?\(G&&G\.description\)/,
);

function renderedDescription(js, shared, id) {
  const start = js.indexOf('tsListRowDescription=function(G){');
  const end = js.indexOf(',Oe=', start);
  assert.ok(start >= 0 && end > start);
  const override = (place) => shared.thingOverrides[`place:${place.id}`] || {};
  const describe = new Function('ha', 'It', 'bi', `let ${js.slice(start, end)};return tsListRowDescription;`)(
    override,
    (place) => productThingCategory(place, override(place)),
    (place) => override(place).price ?? place.price ?? '',
  );
  const place = shared.places.find((row) => row.id === id);
  const ov = override(place);
  const sr = ov.sourceRecord && typeof ov.sourceRecord === 'object' ? ov.sourceRecord : {};
  const expected = String(ov.description ?? sr.description ?? place.description ?? '');
  const description = describe(place);
  assert.equal(description, expected, `place ${id} description not as stored`);
  assert.doesNotMatch(description, COMPOSED_LABEL);
  return description;
}

for (const js of [bundle, readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8')]) {
  for (const id of [609, 603, 604, 601, 602, 605, 610, 608]) {
    renderedDescription(js, payload, id);
  }
}

for (const place of payload.places) {
  const summary = rowSummary(place, payload);
  const detail = detailSummary(place, payload);
  const ov = payload.thingOverrides[`place:${place.id}`] || {};
  const sr = ov.sourceRecord && typeof ov.sourceRecord === 'object' ? ov.sourceRecord : {};
  const expected = pickStoredThingDescription({ override: ov, source: sr, place });
  assert.equal(summary, expected, `vacation-client row summary not as stored for ${place.name}`);
  assert.equal(detail, expected, `vacation-client detail summary not as stored for ${place.name}`);
}

console.log('PASS test_list_row_description_substance');

for (const file of ['shared-trip-oe-list-row-patch.mjs', 'trek-list-row-description-patch.mjs']) {
  const source = readFileSync(new URL('../src/vacation/' + file, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /WebkitLineClamp|WebkitBoxOrient|-webkit-box|data-ts-thing-review-line/);
}
const rowStart = bundle.indexOf('Oe=(G,Re,zt=!1)=>');
const rowEnd = bundle.indexOf(',tt=G=>', rowStart);
assert.doesNotMatch(bundle.slice(rowStart, rowEnd), /tsThingReviewLines|data-ts-thing-review-line|WebkitLineClamp|WebkitBoxOrient|-webkit-box/);
const summaryStart = bundle.indexOf('const sum=String(d.summary');
const summaryEnd = bundle.indexOf('const rev=[1,2,3,4]', summaryStart);
assert.ok(summaryStart > 0 && summaryEnd > summaryStart);
assert.doesNotMatch(bundle.slice(summaryStart, summaryEnd), /WebkitLineClamp|WebkitBoxOrient|-webkit-box|overflow:"hidden"/);
const detailStart = bundle.indexOf('(()=>{const note=tsItinLine(Dt)');
const detailClose = bundle.indexOf('})()]});', detailStart);
assert.ok(detailStart > 0 && detailClose > detailStart, 'detail readonly longDetails IIFE must be present');
const detailEnd = detailClose + 4;
const jsx = (type, props) => ({ type, props });
const renderExtra = new Function('n', 'Dt', 'd', 'tsItinLine', 'tsThingPhotos', 'kl', 'Ds', 'Ce', 'lc', 'return ' + bundle.slice(detailStart, detailEnd));
const detailExtra = (data, photos = []) => renderExtra({ jsx, jsxs: jsx, Fragment: 'fragment' }, data, data, (row) => row.itineraryNote || '', () => photos, () => ({ type: 'day-chip' }), () => true, false, () => { throw new Error('view-only write'); });
const details = '  Stored Details.\nKeep every word.  ';
const note = '  Stored note.  ';
const nodes = detailExtra({ itineraryNote: note, longDetails: details }, [{ id: 'photo', url: '/photo.jpg' }]).props.children;
assert.deepEqual(nodes.map((row) => row.props['data-ts-detail-field'] || (row.props['data-ts-detail-timeline'] ? 'timeline' : 'photos')), ['itineraryNote', 'longDetails', 'timeline', 'photos']);
assert.equal(nodes[0].props.children[1].props.children, note);
assert.equal(nodes[1].props.children[1].props.children, details);
const toggle = nodes[2].props.children[1].props.children[0];
assert.equal(toggle.props.checked, true);
assert.equal(toggle.props.disabled, true);
assert.equal(toggle.props.readOnly, true);
assert.equal(detailExtra({}).props.children[0], null);
assert.equal(detailExtra({}).props.children[1], null);
assert.equal(detailExtra({}).props.children[3], null);
const photoStart = bundle.indexOf('tsThingPhotos=G=>');
const photoEnd = bundle.indexOf(',tsDetailCapturePayload=', photoStart);
assert.ok(photoStart > 0 && photoEnd > photoStart);
const photosFor = new Function('_l', 'fo', 'let ' + bundle.slice(photoStart, photoEnd) + ';return tsThingPhotos')(() => '/brand-logo.png', () => [
  { kind: 'photo', url: '/brand-logo.png' },
  { kind: 'photo', url: 'https://example.test/favicon.ico' },
  { kind: 'photo', url: '/real-photo.jpg' },
  { kind: 'video', url: '/movie.mp4' },
]);
assert.deepEqual(photosFor({}).map((row) => row.url), ['/real-photo.jpg']);
const reviewsStart = bundle.indexOf('const rev=[1,2,3,4].map');
const reviewsEnd = bundle.indexOf('})(),(()=>{const note=', reviewsStart);
const renderReviews = new Function('n', 'd', 'tsRenderStarRatingHtml', 'tsStarRatingAria', bundle.slice(reviewsStart, reviewsEnd));
const reviewData = { review1: 'First', review1Rating: '4', review2: 'Second', review3: 'Third', review3Rating: '3', review4: 'Fourth', review4Rating: '2' };
const reviews = renderReviews({ jsx, jsxs: jsx }, reviewData, String, String).props.children[1];
assert.deepEqual(reviews.map((row) => row.props.children[0]?.props.dangerouslySetInnerHTML.__html || ''), ['4', '', '3', '2']);
