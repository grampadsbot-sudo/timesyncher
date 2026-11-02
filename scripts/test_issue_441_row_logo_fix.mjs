#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { resolveThingLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import {
  LIST_LOGO_QR_GUARD_PATCH,
  patchListLogoQrGuard,
} from '../src/vacation/trek-live-product-patches.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { inkBboxCenterYFromRgba } from '../src/vacation/thing-logo-ink-center.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/gate-b-nyc-shared-staging.json', import.meta.url), 'utf8'),
);

const blueNoteIds = [659, 660, 661];
const served = finalizeServedSharedTripPayload(fixture);
for (const id of blueNoteIds) {
  const place = served.places.find((row) => row.id === id);
  const override = served.thingOverrides[`place:${id}`] || {};
  assert.ok(place, `place ${id} missing from served NYC fixture`);
  const logoUrl = resolveThingLogoUrl(place, override);
  assert.match(logoUrl, /bluenotejazz\.com/i, `place ${id} must carry Blue Note logoUrl`);
  assert.doesNotMatch(logoUrl, /^data:image\/svg\+xml/i, `place ${id} must not use generic svg placeholder`);
}

const guarded = patchListLogoQrGuard(
  '_l=G=>{if(qr(G))return pDe;const Re=ha(G);return Re.logoUrl||Re.iconUrl||G.logoUrl||oi(cc(G))}',
);
assert.equal(guarded, LIST_LOGO_QR_GUARD_PATCH);
assert.match(guarded, /if\(qr\(G\)\)return pDe/);
assert.match(guarded, /Re\.logoUrl\|\|Re\.iconUrl\|\|G\.logoUrl/);

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
});
const bundle = renderServedTrekBundle(raw.toString('utf8'));
assert.ok(bundle.includes(LIST_LOGO_QR_GUARD_PATCH), 'served bundle must embed LIST_LOGO_QR_GUARD_PATCH');
assert.doesNotMatch(bundle, /_l=G=>\{if\(qr\(G\)\)return pDe;const Re=ha\(G\);return Re\.logoUrl/);

const sample = inkBboxCenterYFromRgba(new Uint8ClampedArray([
  255, 255, 255, 255, 20, 20, 20, 255,
  255, 255, 255, 255, 20, 20, 20, 255,
]), 2, 2);
assert.equal(sample, 0.5);

console.log('issue 441 row logo fix tests passed');
