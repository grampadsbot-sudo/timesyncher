#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { logoImgOnLoadInline } from '../src/vacation/thing-logo-fallback-url.mjs';
import { primaryPlaceStarRating } from '../src/vacation/star-rating-model.mjs';
import { patchListRowDates } from '../src/vacation/list-row-dates.mjs';
import { visibleLogoDomCheckSource } from '../src/vacation/shared-trip-logo-audit.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import fixture from './fixtures/nyc-screen-trip99-live-shared-api.json' with { type: 'json' };

const bundlePath = fileURLToPath(new URL('../public/assets/index-BKun7ofk.js', import.meta.url));
const bundle = readFileSync(bundlePath, 'utf8');

assert.match(logoImgOnLoadInline(), /tsInkBboxCenterYFromRgba/);
assert.match(bundle, /"data-ts-list-stars":"1"/);
assert.match(bundle, /tsRowStars\?n\.jsx\("span",\{"data-ts-list-row-rating":"1","data-ts-list-stars":"1"/);
assert.doesNotMatch(
  bundle,
  /dangerouslySetInnerHTML:\{__html:tsRowStars\},role:tsRowStars\?"img":void 0/,
  'travel list rows must not keep empty star anchors',
);

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
assert.equal(rendered, bundle, 'committed served bundle must match renderServedTrekBundle');
assert.equal(patchListRowDates(rendered), rendered, 'list dates patch idempotent after #976');

const hertz = fixture.thingOverrides['place:710'];
assert.equal(primaryPlaceStarRating(hertz), 4.2, 'car rows must surface Priceline 8.4/10 as 4.2 stars');
const parkCentral = fixture.thingOverrides['place:627'];
assert.equal(primaryPlaceStarRating(parkCentral), 3.8, 'Park Central thirdPartyRating');
assert.equal(primaryPlaceStarRating(fixture.thingOverrides['place:601']), null, 'flights without ratings stay unrated');

const parkCentralPlace = fixture.places.find((p) => String(p.name).includes('Park Central'));
assert.ok(parkCentralPlace, 'Park Central place required');
assert.match(String(parkCentralPlace.logoUrl || ''), /parkcentralny\.com/, 'Park Central logo URL present');

assert.match(visibleLogoDomCheckSource(), /naturalWidth > 1/);

console.log('test_issue_976_list_row_logo_stars: ok');
