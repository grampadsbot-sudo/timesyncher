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
assert.match(bundle, /onError:Rn=>\{Rn\.currentTarget\.style\.display="none"\}/);
assert.doesNotMatch(bundle, /LIST_LOGO_PATCH|ts-thing-media\\\/\)\|\|/);
assert.match(bundle, /AI-assisted vacation itinerary planning/);

const payload = finalizeServedSharedTripPayload(buildNycPr225SharedTrip());
const car = payload.places.find((place) => String(place.name || '').includes('Priceline'));
assert.equal(payload.thingOverrides[`place:${car.id}`]?.rentalCompany, 'Priceline opaque');

const dcSnippet = bundle.slice(bundle.indexOf('dc=({item:G,size:Re=28})'), bundle.indexOf('dc=({item:G,size:Re=28})') + 900);
assert.match(dcSnippet, /"data-ts-logo-chip":"1"/, 'logo chip exposes Gate B marker');
assert.match(dcSnippet, /children:zt\?\[n\.jsx\("img"/, 'logo chip uses img or emoji fallback');
assert.match(dcSnippet, /onError:Rn=>\{Rn\.currentTarget\.style\.display="none"\}/, 'broken logo URL hides img so emoji shows');

console.log('shared trip live tab logo tests passed');
