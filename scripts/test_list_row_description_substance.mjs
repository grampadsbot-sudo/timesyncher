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
