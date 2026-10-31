#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { buildNycPr225SharedTrip } from './fixtures/nyc-pr225-shared-trip.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
});

const bundle = renderServedTrekBundle(raw.toString('utf8'));
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(bundle, committed, 'committed served bundle must match renderServedTrekBundle');

assert.match(bundle, /_l=G=>\{if\(qr\(G\)\)return pDe;const Re=ha\(G\);return Re\.logoUrl\|\|Re\.iconUrl\|\|G\.logoUrl\|\|oi\(cc\(G\)\)\}/);
assert.match(bundle, /dc=\(\{item:G,size:Re=28\}\)=>\{const zt=_l\(G\),ua=Pc\(G\)/);
assert.match(bundle, /"data-ts-logo-chip":"1","aria-hidden":"true",style:\{width:Re,height:Re/);
assert.match(bundle, /className:"tiny-logo",src:zt,alt:""/);
assert.match(bundle, /tsLogoFallback/);
assert.match(bundle, /tsv-logo-fallback/);
assert.match(bundle, /ic&&ic!=="\?"\?ic:wl\(G\)/);
assert.doesNotMatch(bundle, /LIST_LOGO_PATCH|ts-thing-media\\\/\)\|\|/);
assert.match(bundle, /AI-assisted vacation itinerary planning/);

const payload = finalizeServedSharedTripPayload(buildNycPr225SharedTrip());
const car = payload.places.find((place) => String(place.name || '').includes('Priceline'));
assert.equal(payload.thingOverrides[`place:${car.id}`]?.rentalCompany, 'Priceline opaque');

const nestedLogoPayload = finalizeServedSharedTripPayload({
  places: [{ id: 801, name: 'North venue', category_name: 'Store', metadata: { sourceRecord: { favicon: 'https://north.example/icon.png' } } },
    { id: 802, name: 'South venue', category_name: 'Restaurant', source_record: { logo: 'https://south.example/logo.svg' } }],
  thingOverrides: {},
});
assert.equal(nestedLogoPayload.thingOverrides['place:801'].logoUrl, 'https://north.example/icon.png');
assert.equal(nestedLogoPayload.thingOverrides['place:802'].logoUrl, 'https://south.example/logo.svg');

const dcSnippet = bundle.slice(bundle.indexOf('dc=({item:G,size:Re=28})'), bundle.indexOf('dc=({item:G,size:Re=28})') + 900);
assert.match(dcSnippet, /"data-ts-logo-chip":"1"/, 'logo chip exposes Gate B marker');
assert.match(dcSnippet, /className:"tsv-logo-fallback"/, 'logo chip keeps type-icon fallback visible');
assert.match(dcSnippet, /tsLogoFallback/, 'logo chip retries favicon services before emoji fallback');

console.log('shared trip live tab logo tests passed');
